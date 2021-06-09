/**
 * 文本编辑（单次）操作的信息
 */
class TextEditAction {
    constructor(
        editorIdentify,
        selectionBefore, selectionAfter,
        textChanges) {
        this.editorIdentify = editorIdentify; // 编辑器识别
		this.selectionBefore = selectionBefore; // 操作前的光标/位置
		this.selectionAfter = selectionAfter; // 操作后的光标/位置
		this.textChanges = textChanges; // jstextdiffpatch 包的 TextChange 对象的数组
	}
}

module.exports = TextEditAction;