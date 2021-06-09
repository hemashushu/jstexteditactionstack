/**
 * 编辑器（或者编辑框、或者编辑器标签页，以下简称编辑器）的识别值
 *
 * 当应用程序支持同时编辑同一个文档时（比如支持窗口切分、或者支持多个应用程序
 * 实例），编辑操作（动作）既有可能是当前编辑器产生的，也可能是由其他同文当编辑器
 * 产生的。所以每个编辑器都应该有一个识别值，用于识别编辑操作（动作）是否从同一个
 * 编辑器产生。
 */
class AbstractEditorIdentify {

    /**
     * 用于比较两个识别值是否相等。
     *
     * 子类必须重写（override）该方法。
     * @param {*} other
     * @returns
     */
    equals(other) {
        return false;
    }
}

module.exports = AbstractEditorIdentify;