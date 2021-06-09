const { ImmutableEventObject } = require('jsevent');
const { TextDiffPatch, TextChange, ChangeType, CursorPatch } = require('jstextdiffpatch');

const TextEditAction = require('./texteditaction');
const TextEditActionType = require('./texteditactiontype');

/**
 * 提供文本编辑的 undo/redo 功能
 *
 * - 编辑记录栈储存的是文本变化情况（TextEditAction）而不是全文本，所以会有一些
 *   小问题：比如在文本 'aR' 之间插入字母 'R' 时，文本的（差异）比较结果可能会认为
 *   是在 'aR' 后面添加了一个字母 'R'，而不是在两个源字母之间插入字母 'R',
 *   于是导致在 redo 此步骤时光标有可能被放置在 'aR' 的后面，而正确的光标应该放置
 *   在 'aR' 之间。还好这个问题只影响到光标的位置，不影响内容的复原。另外 TextEditAction
 *   同时记录了文本变化前后光标的位置，实际上会否出现该问题有待检验。
 * - 连续的相同类型的操作会被合并，比如用户连续输入字母，则这几次单字母录入操作将会
 *   合并为一个多字母录入操作，这样可以减少记录的数量，同时在 undo 时也有较好的体验。
 * - 目前不合并用户录入的新行（'\n'），基于上面第一条的原因，如果合并连续的新行操作，
 *   有可能会导致复原内容失败。实际上会否出现该问题有待检验。
 *
 * TODO::
 * - 检验上述第一条问题
 * - 检验上述第三条问题
 *
 */
class TextEditActionStack extends ImmutableEventObject {

    /**
     *
     * @param {*} editorIdentify 编辑器识别值
     */
    constructor(editorIdentify) {
        super([
            // - 本事件被触发的条件：
            //   1. 当用户在当前编辑器录入文字；
            //   2. 当用户录入文字或快捷键等操作而触发的诸如“自动完成”和“自动更正”等程序的自动操作；
            //   3. 当用户执行 undo/redo 操作时。
            //
            // - 本事件不会触发的情况：
            //   1. 外部“同文档”编辑器同步（发送）过来的编辑操作
            //
            // - 本事件触发时所携带的编辑信息（TextEditAction）是原始的、非合并后的数据。
            // - 本事件主要用于广播当前的操作（动作）到其他同文档的编辑器。
            //   至于当前文档编辑器的内容被改变之后所需要的处理，比如格式渲染，结构分析等不应该
            //   依赖该事件，因为上述第二条的某些情况下，编辑器内容会发生改变但不会触发本事件。
            'actionCreate'
        ]);

        this.editorIdentify = editorIdentify;

        // undo 栈
        this.undoActions = [];

        // redo 栈
        // - 当用户执行 undo 操作时，会把当次操作的变化压入 redo 栈。
        // - 用户新录入内容时，需要清空 redo 栈（否则会出现逻辑错误）。
        this.redoActions = [];
    }

    /**
     * 清空 undo/redo 堆栈
     *
     * 调用该方法的情况：
     * - 当一个编辑框完成加载文本准备好初始工作时，
     * - 或者编辑器新建一个空文本准备好初始工作时，
     * - 或者编辑器内容回滚
     *
     */
    clear() {
        this.undoActions = [];
        this.redoActions = [];
    }

    /**
     * 计算编辑框的文本内容变化然后压入 undo 栈。
     *
     * - 调用该方法的情况：
     *   1. 当用户在当前编辑器录入文字；
     *   2. 当用户录入文字或快捷键等操作而触发的诸如“自动完成”和“自动更正”等程序的自动操作；
     * - 调用该方法之前要确认文本内容确实发生了改变
     *
     * @param {*} lastTextContent 操作前的全文本
     * @param {*} textContent 当前的全文本
     * @param {*} lastSelection 操作前的光标/位置
     * @param {*} selection 当前的光标/位置
     * @returns 返回当次编辑操作的信息 TextEditAction。
     */
    update(lastTextContent, textContent, lastSelection, selection) {
        let textChanges = TextDiffPatch.diff(lastTextContent, textContent);
        return this.updateByTextChanges(textChanges, lastSelection, selection);
    }

    /**
     * 将编辑框的文本内容变化压入 undo 栈。
     *
     * @param {*} textChanges 文本内容的变化，一个 TextChange 对象数组。
     * @param {*} lastSelection 操作前的光标/位置
     * @param {*} selection 当前的光标/位置
     * @returns 返回当次编辑操作的信息 TextEditAction。
     */
    updateByTextChanges(textChanges, lastSelection, selection) {
        // 构建 TextEditAction 实例，发出 actionCreate 事件
        let textEditAction = new TextEditAction(
            this.editorIdentify,
            lastSelection, selection, textChanges);

        super.dispatch('actionCreate', {
            textEditActionType: TextEditActionType.update,
            textEditAction: textEditAction
        });

        // 将当次文本编辑操作压入 undo 栈。
        this.pushIntoUndoStack(textEditAction);

        return textEditAction;
    }

    /**
     * 将由外部编辑器传过来的编辑操作压入 undo 栈
     *
     * @param {*} textEditAction
     * @param {*} lastTextContent
     * @param {*} lastSelection
     * @returns
     */
    updateAndApplyByExternalTextEditAction(textEditAction, lastTextContent, lastSelection) {
        let textContent = TextDiffPatch.apply(lastTextContent, textEditAction.textChanges);

        this.pushIntoUndoStack(textEditAction);

        // 计算应用了“外部编辑操作”之后的光标新位置
        let selection = CursorPatch.apply(lastSelection, textEditAction.textChanges);

        // 返回新的文本内容及新的光标位置
        return {
            textContent: textContent,
            selection: selection
        };
    }

    /**
     * 将当次文本编辑操作压入 undo 栈。
     *
     * @param {*} currentTextEditAction
     */
    pushIntoUndoStack(currentTextEditAction) {
        let { editorIdentify, textChanges, selectionBefore, selectionAfter } = currentTextEditAction;
        let lastTextEditAction;

        if (this.undoActions.length > 0) {
            lastTextEditAction = this.undoActions[this.undoActions.length - 1];
        }

        // 先检查能否合并操作，如果是简单的编辑操作则合并。
        // 不是简单的操作则直接压入 undo 栈。
        //
        // 简单的操作是指同一个编辑器：
        // - 连续录入一个或多个字符
        // - 连续向后删除字符（backspace）
        // - 连续向前删除字符（delete）
        //
        // 连续是指操作前后的光标是连续的，或者严格来说，是指前后两次文本的变更的位置起止是
        // 相连的，符合上面特征的较大机率是用户通过键盘的编辑操作，
        // 合并用户手工的连续操作有更好的体验，比如连续多次录入字符，在 undo 时可以一次撤销。

        if (this.undoActions.length === 0 || // undo 栈为空的，即没有上一次操作记录
            textChanges.length > 1 || // 当前改变的不止一处
            selectionAfter.start !== selectionAfter.end || // 光标不是折叠的，不是用户手工录入操作
            !editorIdentify.equals(lastTextEditAction.editorIdentify)) { // 不是同一个编辑器的操作

            let textEditAction = new TextEditAction(editorIdentify,
                selectionBefore, selectionAfter, textChanges);

            this.undoActions.push(textEditAction);
            this.redoActions = []; // 清空 redo 栈
            return;
        }

        // 以下准备构建新的编辑操作（TextEditAction），并替换 undo 栈
        // 的最后一项。

        // 合并后的 TextChange 数组
        let combinedTextChanges;

        let lastTextChanges = lastTextEditAction.textChanges;

        // 上一次文本改变的最后一个 TextChange
        let lastTextChange = lastTextChanges[lastTextChanges.length - 1];

        // 经过上面的筛选，确定当前操作只有一处改变，所以只取第一项 TextChange
        let currentTextChange = textChanges[0];

        if (/^\n+$/.test(currentTextChange.text) ||
            /^\n+$/.test(lastTextChange.text)) {
            // 不合并换行符，以免因为合并而导致 redo 时出错
            combinedTextChanges = [currentTextChange]

        } else if (
            lastTextChange.changeType === ChangeType.added &&
            currentTextChange.changeType === ChangeType.added) {

            // 检查是否简单的“添加文本”操作

            // 检查光标/位置是否连续时，使用 'currentTextChange.position' 和 'lastTextChange.position'
            // 来判断，它们比 'selectionAfter.start' 和 'lastTextEditAction.selectionAfter.start' 更准确可靠。
            // 因为严格来说我们是判断文本的变更是否连续的而不是光标，某些操作，比如查找替换，或者文本的自动完成，
            // 光标的位置跟文本发生改变的位置并不一样。

            if (currentTextChange.position === lastTextChange.position + lastTextChange.text.length) {
                let combinedTextChange = new TextChange(
                    lastTextChange.position, ChangeType.added,
                    lastTextChange.text + currentTextChange.text);

                // 复制 lastTextChanges 除了最后一项之外的所有项目
                combinedTextChanges = lastTextChanges.slice(0, lastTextChanges.length - 1);
                combinedTextChanges.push(combinedTextChange);

                selectionBefore = lastTextEditAction.selectionBefore; // 将光标往后（上一次）扩展
                this.undoActions.pop(); // 弹出最后一次编辑操作，准备压入新的编辑操作

            } else {
                combinedTextChanges = [currentTextChange]
            }

        } else if (
            lastTextChange.changeType === ChangeType.removed &&
            currentTextChange.changeType === ChangeType.removed) {

            // 检查是否简单的“删除文本”操作

            // 检查光标/位置是否连续时，使用 'currentTextChange.position' 和 'lastTextChange.position'
            // 来判断，它们比 'selectionAfter.start' 和 'lastTextEditAction.selectionAfter.start' 更准确可靠。
            // 因为严格来说我们是判断文本的变更是否连续的而不是光标，某些操作，比如查找替换，或者文本的自动完成，
            // 光标的位置跟文本发生改变的位置并不一样。

            if (currentTextChange.position === lastTextChange.position) {
                // 用户按了 'delete' 键
                let combinedTextChange = new TextChange(
                    lastTextChange.position,
                    ChangeType.removed,
                    lastTextChange.text + currentTextChange.text); // the previous removing + this time removing.

                // 复制 lastTextChanges 除了最后一项之外的所有项目
                combinedTextChanges = lastTextChanges.slice(0, lastTextChanges.length - 1);
                combinedTextChanges.push(combinedTextChange);

                selectionBefore = lastTextEditAction.selectionBefore; // 将光标往后（上一次）扩展
                this.undoActions.pop(); // 弹出最后一次编辑操作，准备压入新的编辑操作

            } else if (currentTextChange.position === lastTextChange.position - currentTextChange.text.length) {
                // 用户按了 'backspace' 键
                let combinedTextChange = new TextChange(
                    currentTextChange.position,
                    ChangeType.removed,
                    currentTextChange.text + lastTextChange.text); // this time removing + the previous removing.

                // 复制 lastTextChanges 除了最后一项之外的所有项目
                combinedTextChanges = lastTextChanges.slice(0, lastTextChanges.length - 1);
                combinedTextChanges.push(combinedTextChange);

                selectionBefore = lastTextEditAction.selectionBefore; // 将光标往后（上一次）扩展
                this.undoActions.pop(); // 弹出最后一次编辑操作，准备压入新的编辑操作

            } else {
                // combinedTextChanges.push(currentTextChange); // 没法合并，保持 TextChange 数组不变
                combinedTextChanges = [currentTextChange];
            }

        } else {

            // 没法合并，保持 TextChange 数组不变
            combinedTextChanges = [currentTextChange];
        }

        // 重组 TextEditAction
        let textEditAction = new TextEditAction(
            editorIdentify,
            selectionBefore, selectionAfter, combinedTextChanges);

        this.undoActions.push(textEditAction);
        this.redoActions = []; // 清空 redo 栈
    }

    /**
     * 执行 undo 操作
     * @param {*} lastTextContent
     * @returns
     */
    undo(lastTextContent) {
        if (!this.canUndo) {
            return;
        }

        let textEditAction = this.undoActions.pop();

        // 使用当前的 EditorIdentify 重新包装 TextEditAction
        let repackedTextEditAction = new TextEditAction(
            this.editorIdentify,
            textEditAction.selectionBefore,
            textEditAction.selectionAfter,
            textEditAction.textChanges
        );

        // 压入 redo 栈
        this.redoActions.push(repackedTextEditAction);

        let reverseTextEditAction = this.reverseAction(repackedTextEditAction);
        let { textContent, selection } = this.applyTextEditAction(reverseTextEditAction, lastTextContent);

        // 发出 actionCreate 事件
        super.dispatch('actionCreate', {
            textEditActionType: TextEditActionType.restore,
            textEditAction: reverseTextEditAction
        });

        return {
            textContent,
            selection,
            textEditAction: reverseTextEditAction
        };
    }

    /**
     * 执行 redo 操作
     * @param {*} lastTextContent
     * @returns
     */
    redo(lastTextContent) {
        if (!this.canRedo) {
            return;
        }

        let textEditAction = this.redoActions.pop();

        // 使用当前的 EditorIdentify 重新包装 TextEditAction
        let repackedTextEditAction = new TextEditAction(
            this.editorIdentify,
            textEditAction.selectionBefore,
            textEditAction.selectionAfter,
            textEditAction.textChanges
        );

        // 压入 undo 栈
        this.undoActions.push(repackedTextEditAction);

        let { textContent, selection } = this.applyTextEditAction(repackedTextEditAction, lastTextContent);

        // 发出 actionCreate 事件
        super.dispatch('actionCreate', {
            textEditActionType: TextEditActionType.restore,
            textEditAction: repackedTextEditAction
        });

        return {
            textContent,
            selection,
            textEditAction: repackedTextEditAction
        };
    }

    /**
     * 在文本上执行指定的编辑操作
     *
     * 即根据指定的编辑操作（TextEditAction），计算出文本被编辑后的内容及光标位置
     * @param {*} textEditAction
     * @param {*} lastTextContent
     * @returns
     */
    applyTextEditAction(textEditAction, lastTextContent) {
        let textContent = TextDiffPatch.apply(lastTextContent, textEditAction.textChanges);
        let selection = textEditAction.selectionAfter;

        return {
            textContent: textContent,
            selection: selection
        };
    }

    /**
     * 反转 TextEditAction 当中的 TextChange。
     *
     * 用于在 undo 操作当中将编辑操作转变为 redo 编辑操作。
     * @param {*} textEditAction
     * @returns
     */
    reverseAction(textEditAction) {
        return new TextEditAction(
            textEditAction.editorIdentify,
            textEditAction.selectionAfter,
            textEditAction.selectionBefore,
            TextDiffPatch.reverse(textEditAction.textChanges));
    }

    get canUndo() {
        return this.undoActions.length > 0;
    }

    get canRedo() {
        return this.redoActions.length > 0;
    }

}

module.exports = TextEditActionStack;