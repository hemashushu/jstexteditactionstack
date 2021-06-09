/**
 * 文本编辑操作的（动作的）类型
 *
 */
const TextEditActionType = {

    /**
     * 用户录入动作
     */
    update: 'update',

    /**
     * 使用 undo/redo 还原内容的操作
     */
	restore: 'restore',

};

module.exports = TextEditActionType;