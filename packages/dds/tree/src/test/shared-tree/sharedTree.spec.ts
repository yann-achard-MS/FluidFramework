/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { fail, strict as assert } from "assert";
import {
    FieldKinds,
    singleTextCursor,
    anchorSymbol,
    isUnwrappedNode,
    valueSymbol,
    getSchemaString,
} from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey, rootFieldKey, symbolFromKey, TreeValue, Value } from "../../tree";
import { TreeNavigationResult } from "../../forest";
import { TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, GlobalFieldKey, namedTreeSchema, SchemaData } from "../../schema-stored";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");
const globalFieldKeySymbol = symbolFromKey(globalFieldKey);

describe("SharedTree", () => {
    it("reads only one node", async () => {
        // This is a regression test for a scenario in which a transaction would apply its delta twice,
        // inserting two nodes instead of just one
        const provider = await TestTreeProvider.create(1);
        provider.trees[0].runTransaction((f, editor) => {
            const writeCursor = singleTextCursor({ type: brand("LonelyNode") });
            const field = editor.sequenceField(undefined, detachedFieldAsKey(f.rootField));
            field.insert(0, writeCursor);

            return TransactionResult.Apply;
        });

        const { forest } = provider.trees[0];
        const readCursor = forest.allocateCursor();
        const destination = forest.root(provider.trees[0].forest.rootField);
        const cursorResult = forest.tryMoveCursorTo(destination, readCursor);
        assert.equal(cursorResult, TreeNavigationResult.Ok);
        assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
        readCursor.free();
        forest.forgetAnchor(destination);
    });

    it("can be connected to another tree", async () => {
        const provider = await TestTreeProvider.create(2);
        assert(provider.trees[0].isAttached());
        assert(provider.trees[1].isAttached());

        const value = "42";
        const expectedSchema = getSchemaString(testSchema);

        // Apply an edit to the first tree which inserts a node with a value
        initializeTestTreeWithValue(provider.trees[0], value);

        // Ensure that the first tree has the state we expect
        assert.equal(getTestValue(provider.trees[0]), value);
        assert.equal(getSchemaString(provider.trees[0].storedSchema), expectedSchema);
        // Ensure that the second tree receives the expected state from the first tree
        await provider.ensureSynchronized();
        assert.equal(getTestValue(provider.trees[1]), value);
        // Ensure second tree got the schema from initialization:
        assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
        // Ensure that a tree which connects after the edit has already happened also catches up
        const joinedLaterTree = await provider.createTree();
        assert.equal(getTestValue(joinedLaterTree), value);
        // Ensure schema catchup works:
        assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
    });

    it("can summarize and load", async () => {
        const provider = await TestTreeProvider.create(1);
        const [summarizingTree] = provider.trees;
        const summarize = await provider.enableManualSummarization();
        const value = 42;
        initializeTestTreeWithValue(summarizingTree, value);
        await summarize();
        await provider.ensureSynchronized();
        const loadingTree = await provider.createTree();
        assert.equal(getTestValue(loadingTree), value);
        assert.equal(getSchemaString(loadingTree.storedSchema), getSchemaString(testSchema));
    });

    it("can process ops after loading from summary", async () => {
        function insert(tree: ISharedTree, index: number, value: string): void {
            tree.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
                field.insert(index, singleTextCursor({ type: brand("Node"), value }));
                return TransactionResult.Apply;
            });
        }

        // Validate that the given tree is made up of nodes with the expected value
        function validateTree(tree: ISharedTree, expected: Value[]): void {
            const readCursor = tree.forest.allocateCursor();
            const destination = tree.forest.root(tree.forest.rootField);
            let cursorResult = tree.forest.tryMoveCursorTo(destination, readCursor);
            for (const value of expected) {
                assert.equal(cursorResult, TreeNavigationResult.Ok);
                assert.equal(readCursor.value, value);
                cursorResult = readCursor.seek(1);
            }
            assert.equal(cursorResult, TreeNavigationResult.NotFound);
            readCursor.free();
            tree.forest.forgetAnchor(destination);
        }

        const provider = await TestTreeProvider.create(1);
        const summarize = await provider.enableManualSummarization();
        const tree1 = provider.trees[0];
        const tree2 = await provider.createTree();
        const tree3 = await provider.createTree();
        const [container1, container2, container3] = provider.containers;

        const schema: SchemaData = {
            treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
            globalFieldSchema: new Map([
                // This test requires the use of a sequence field
                [rootFieldKey, fieldSchema(FieldKinds.sequence)],
            ]),
        };
        tree1.storedSchema.update(schema);

        insert(tree1, 0, "Z");
        insert(tree1, 1, "A");
        insert(tree1, 2, "C");

        await provider.ensureSynchronized();

        // Stop the processing of incoming changes on tree2 so that it does not learn about the deletion of Z
        await provider.opProcessingController.pauseProcessing(container3);

        // Delete Z
        tree2.runTransaction((forest, editor) => {
            const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
            field.delete(0, 1);
            return TransactionResult.Apply;
        });

        // Ensure tree2 has a chance to send deletion of Z
        await provider.opProcessingController.processOutgoing(container2);

        // Ensure tree1 has a chance to receive the deletion of Z before putting out a summary
        await provider.opProcessingController.processIncoming(container1);
        validateTree(tree1, ["A", "C"]);

        // Have tree1 make a summary
        // Summarized state: A C
        await summarize();

        // Insert B between A and C (without knowing of Z being deleted)
        insert(tree3, 2, "B");

        // Ensure the insertion of B is sent for processing by tree3 before tree3 receives the deletion of Z
        await provider.opProcessingController.processOutgoing(container3);

        // Allow tree3 to receive further changes (i.e., the deletion of Z)
        provider.opProcessingController.resumeProcessing(container3);

        // Ensure all trees are now caught up
        await provider.ensureSynchronized();

        // Load the last summary (state: "AC") and process the deletion of Z and insertion of B
        const tree4 = await provider.createTree();

        // Ensure tree4 has a chance to process trailing ops.
        await provider.ensureSynchronized();

        // Trees 1 through 3 should get the correct end state (ABC) whether we include EditManager data
        // in summaries or not.
        validateTree(tree1, ["A", "B", "C"]);
        validateTree(tree2, ["A", "B", "C"]);
        validateTree(tree3, ["A", "B", "C"]);
        // tree4 should only get the correct end state if was able to get the adequate
        // EditManager state from the summary. Specifically, in order to correctly rebase the insert
        // of B, tree4 needs to have a local copy of the edit that deleted Z, so it can
        // rebase the insertion of  B over that edit.
        // Without that, it will interpret the insertion of B based on the current state, yielding
        // the order ACB.
        validateTree(tree4, ["A", "B", "C"]);
    });

    describe("Editing", () => {
        it("can insert and delete a node", async () => {
            const value = "42";
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert node
            initializeTestTreeWithValue(tree1, value);

            await provider.ensureSynchronized();

            // Validate insertion
            assert.equal(getTestValue(tree2), value);

            // Delete node
            tree1.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
                field.delete(0, 1);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            assert.equal(getTestValue(tree1), undefined);
            assert.equal(getTestValue(tree2), undefined);
        });

        // TODO: Add global field representation in changesets and delta
        it.skip("can edit a global field", async () => {
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert root node
            initializeTestTreeWithValue(tree1, 42);

            // Insert child in global field
            tree1.runTransaction((forest, editor) => {
                const writeCursor = singleTextCursor({ type: brand("TestValue"), value: 43 });
                const field = editor.sequenceField(
                    {
                        parent: undefined,
                        parentField: detachedFieldAsKey(forest.rootField),
                        parentIndex: 0,
                    },
                    globalFieldKeySymbol,
                );
                field.insert(0, writeCursor);

                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate insertion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult1 = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult1, TreeNavigationResult.Ok);
                const cursorResult2 = readCursor.down(globalFieldKeySymbol, 0);
                assert.equal(cursorResult2, TreeNavigationResult.Ok);
                const { value } = readCursor;
                assert.equal(value, 43);
                readCursor.free();
                tree2.forest.forgetAnchor(destination);
            }

            // Delete node
            tree2.runTransaction((forest, editor) => {
                const field = editor.sequenceField(
                    {
                        parent: undefined,
                        parentField: detachedFieldAsKey(forest.rootField),
                        parentIndex: 0,
                    },
                    globalFieldKeySymbol,
                );
                field.delete(0, 1);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate deletion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult1 = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult1, TreeNavigationResult.Ok);
                const cursorResult2 = readCursor.down(globalFieldKeySymbol, 0);
                assert.equal(cursorResult2, TreeNavigationResult.NotFound);
            }
        });

        it("can insert multiple nodes", async () => {
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert nodes
            tree1.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
                field.insert(0, singleTextCursor({ type: brand("Test"), value: 1 }));
                return TransactionResult.Apply;
            });

            tree1.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
                field.insert(1, singleTextCursor({ type: brand("Test"), value: 2 }));
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate insertion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult, TreeNavigationResult.Ok);
                assert.equal(readCursor.value, 1);
                assert.equal(readCursor.seek(1), TreeNavigationResult.Ok);
                assert.equal(readCursor.value, 2);
                assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
                readCursor.free();
                tree2.forest.forgetAnchor(destination);
            }
        });
    });

    it("can edit using editable-tree", async () => {
        const provider = await TestTreeProvider.create(1);
        const [sharedTree] = provider.trees;

        // Currently EditableTree does not have a way to hold onto fields/sequences across edits, only nodes, so insert a node to get started.

        // Insert node
        initializeTestTreeWithValue(sharedTree, 1);

        // Locate node to edit using EditableTree API
        const editable = sharedTree.root;
        assert(isUnwrappedNode(editable));
        const anchor = editable[anchorSymbol];

        // Check value we will edit is what we initialized it to.
        assert.equal(editable[valueSymbol], 1);

        // Perform an edit
        sharedTree.runTransaction((forest, editor) => {
            // Perform an edit
            const path = sharedTree.locate(anchor) ?? fail("anchor should exist");
            sharedTree.context.prepareForEdit();
            editor.setValue(path, 2);

            // Check that the edit is reflected in the EditableTree
            assert.equal(editable[valueSymbol], 2);

            sharedTree.context.prepareForEdit();
            return TransactionResult.Apply;
        });

        // Check that the edit is reflected in the EditableTree after the transaction.
        assert.equal(editable[valueSymbol], 2);
    });
});

const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
    name: brand("TestValue"),
    extraLocalFields: fieldSchema(FieldKinds.sequence),
    globalFields: [globalFieldKey],
});
const testSchema: SchemaData = {
    treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootFieldSchema],
        [globalFieldKey, globalFieldSchema],
    ]),
};

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
    tree.storedSchema.update(testSchema);

    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}

/**
 * Reads a value in a tree set by {@link initializeTestTreeWithValue} if it exists.
 */
function getTestValue({ forest }: ISharedTree): TreeValue | undefined {
    const readCursor = forest.allocateCursor();
    const destination = forest.root(forest.rootField);
    const cursorResult = forest.tryMoveCursorTo(destination, readCursor);
    if (cursorResult !== TreeNavigationResult.Ok) {
        return undefined;
    }
    const { value } = readCursor;
    readCursor.free();
    forest.forgetAnchor(destination);
    if (cursorResult === TreeNavigationResult.Ok) {
        return value;
    }

    return undefined;
}
