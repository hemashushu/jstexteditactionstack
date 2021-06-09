const assert = require('assert/strict');

const EditorIdentify = require('./implements/editoridentify');

const { ObjectUtils } = require('jsobjectutils');
const { TextSelection } = require('jstextselection');
const { TextChange, ChangeType } = require('jstextdiffpatch');

const { TextEditAction,
    TextEditActionStack,
    TextEditActionType } = require('../index');

describe('TextEditActionStack Test', () => {
    it('Test update()', () => {
        let editor1 = new EditorIdentify('foo');
        let stack1 = new TextEditActionStack(editor1);

        let selection1 = new TextSelection(0);
        let selection2 = new TextSelection(2);

        action1 = stack1.update('', 'ab', selection1, selection2);

        assert(ObjectUtils.objectEquals(action1,
            new TextEditAction(
                editor1, new TextSelection(0), new TextSelection(2),
                [new TextChange(0, ChangeType.added, 'ab')]
            )));

        // TODO::
    });

});