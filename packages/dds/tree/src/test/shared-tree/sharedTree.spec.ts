/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey, JsonableTree } from "../../tree";
import { TreeNavigationResult } from "../../forest";
import { TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { TreeSchemaIdentifier } from "../../schema-stored";

describe("SharedTree", () => {
    it("can be connected to another tree", async () => {
        const provider = await TestTreeProvider.create(2);
        assert(provider.trees[0].isAttached());
        assert(provider.trees[1].isAttached());

        const value = "42";

        // Validate that the given tree has the state we create in this test
        function validateTree(tree: ISharedTree): void {
            const readCursor = tree.forest.allocateCursor();
            const destination = tree.forest.root(tree.forest.rootField);
            const cursorResult = tree.forest.tryMoveCursorTo(destination, readCursor);
            assert.equal(cursorResult, TreeNavigationResult.Ok);
            assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
            assert.equal(readCursor.value, value);
            readCursor.free();
            tree.forest.forgetAnchor(destination);
        }

        // Apply an edit to the first tree which inserts a node with a value
        provider.trees[0].runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor({ type: brand("Test"), value });
            editor.insert({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, writeCursor);

            return TransactionResult.Apply;
        });

        // Ensure that the first tree has the state we expect
        validateTree(provider.trees[0]);
        // Ensure that the second tree receives the expected state from the first tree
        await provider.ensureSynchronized();
        validateTree(provider.trees[1]);
        // Ensure that a tree which connects after the edit has already happened also catches up
        const joinedLaterTree = await provider.createTree();
        validateTree(joinedLaterTree);
    });

    it("can process ops after loading from summary", async () => {
        function insert(tree: ISharedTree, index: number, value: string): void {
            tree.runTransaction((forest, editor) => {
                editor.insert({
                    parent: undefined,
                    parentField: detachedFieldAsKey(forest.rootField),
                    parentIndex: index,
                }, singleTextCursor({ type: brand("Node"), value }));
                return TransactionResult.Apply;
            });
        }

        // Validate that the given tree has the state we create in this test
        function validateTree(tree: ISharedTree): void {
            const readCursor = tree.forest.allocateCursor();
            const destination = tree.forest.root(tree.forest.rootField);
            const cursorResult = tree.forest.tryMoveCursorTo(destination, readCursor);
            assert.equal(cursorResult, TreeNavigationResult.Ok);
            assert.equal(readCursor.value, "A");
            assert.equal(readCursor.seek(1), TreeNavigationResult.Ok);
            assert.equal(readCursor.value, "B");
            assert.equal(readCursor.seek(1), TreeNavigationResult.Ok);
            assert.equal(readCursor.value, "C");
            assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
            readCursor.free();
            tree.forest.forgetAnchor(destination);
        }

        const provider = await TestTreeProvider.create(1);
        const summarize = await provider.enableManualSummarization();
        await summarize();
        const tree1 = provider.trees[0];
        const tree2 = await provider.createTree();

        insert(tree1, 0, "Z");
        insert(tree1, 1, "A");
        insert(tree1, 2, "C");

        await provider.ensureSynchronized();

        // Delete Z
        tree1.runTransaction((forest, editor) => {
            editor.delete({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, 1);
            return TransactionResult.Apply;
        });

        // TODO: Before summarizing, we need to sequence the deletion of Z without
        // tree2 being made aware of it.
        await summarize();

        // Insert B between A and C (before knowing of Z being deleted)
        insert(tree2, 2, "B");

        await provider.ensureSynchronized();

        // Should load the last summary (state: "AC") and process
        // the insertion of B
        const joinedLaterTree = await provider.createTree();

        await provider.ensureSynchronized();

        validateTree(tree1);
        validateTree(tree2);
        validateTree(joinedLaterTree);
    });
});
