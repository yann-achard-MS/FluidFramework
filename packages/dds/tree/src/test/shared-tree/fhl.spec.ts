/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { emptyField, FieldKinds, jsonableTreeFromCursor, singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey, EmptyKey, JsonableTree, rootFieldKey, TreeValue, UpPath, upPathUnder } from "../../tree";
import { TreeNavigationResult } from "../../forest";
import { TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import {
    fieldSchema,
    NamedTreeSchema,
    namedTreeSchema,
    SchemaData,
    TreeSchemaIdentifier,
    ValueSchema,
} from "../../schema-stored";

const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

const int32Schema = namedTreeSchema({
    name: brand("Int32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

const float32Schema = namedTreeSchema({
    name: brand("Float32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

const complexPhoneSchema = namedTreeSchema({
    name: brand("Test:Phone-1.0.0"),
    localFields: {
        number: fieldSchema(FieldKinds.value, [stringSchema.name]),
        prefix: fieldSchema(FieldKinds.value, [stringSchema.name]),
        kind: fieldSchema(FieldKinds.value, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

// This schema is really unnecessary: it could just use a sequence field instead.
// Array nodes are only needed when you want polymorphism over array vs not-array.
// Using this tests handling of array nodes (though it makes this example not cover other use of sequence fields).
const phonesSchema = namedTreeSchema({
    name: brand("Test:Phones-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name, int32Schema.name, complexPhoneSchema.name]),
    },
    extraLocalFields: emptyField,
});

const addressSchema = namedTreeSchema({
    name: brand("Test:Address-1.0.0"),
    localFields: {
        street: fieldSchema(FieldKinds.value, [stringSchema.name]),
        zip: fieldSchema(FieldKinds.optional, [stringSchema.name]),
        phones: fieldSchema(FieldKinds.value, [phonesSchema.name]),
    },
    extraLocalFields: emptyField,
});

const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.value, [stringSchema.name]),
    value: ValueSchema.Serializable,
});

const personSchema = namedTreeSchema({
    name: brand("Test:Person-1.0.0"),
    localFields: {
        name: fieldSchema(FieldKinds.value, [stringSchema.name]),
        age: fieldSchema(FieldKinds.value, [int32Schema.name]),
        salary: fieldSchema(FieldKinds.value, [float32Schema.name]),
        friends: fieldSchema(FieldKinds.value, [mapStringSchema.name]),
        address: fieldSchema(FieldKinds.value, [addressSchema.name]),
    },
    extraLocalFields: emptyField,
});

const optionalChildSchema = namedTreeSchema({
    name: brand("Test:OptionalChild-1.0.0"),
    localFields: {
        child: fieldSchema(FieldKinds.optional),
    },
    value: ValueSchema.Serializable,
    extraLocalFields: emptyField,
});

const emptyNode: JsonableTree = { type: optionalChildSchema.name };

const schemaTypes: Set<NamedTreeSchema> = new Set([
    optionalChildSchema,
    stringSchema,
    float32Schema,
    int32Schema,
    complexPhoneSchema,
    phonesSchema,
    addressSchema,
    mapStringSchema,
    personSchema,
]);

const schemaMap: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
for (const named of schemaTypes) {
    schemaMap.set(named.name, named);
}

const rootPersonSchema = fieldSchema(FieldKinds.value, [personSchema.name]);

const fullSchemaData: SchemaData = {
    treeSchema: schemaMap,
    globalFieldSchema: new Map([[rootFieldKey, rootPersonSchema]]),
};

describe("FHL", () => {
    it("can apply a transform-based edit", async () => {
        const provider = await TestTreeProvider.create(2);
        const [tree1, tree2] = provider.trees;

        const person: JsonableTree = {
            type: personSchema.name,
            fields: {
                name: [{ value: "Adam", type: stringSchema.name }],
                age: [{ value: 35, type: int32Schema.name }],
                salary: [{ value: 10420.2, type: float32Schema.name }],
                friends: [{ fields: {
                    Mat: [{ type: stringSchema.name, value: "Mat" }],
                }, type: mapStringSchema.name }],
                address: [{
                    fields: {
                        street: [{ value: "treeStreet", type: stringSchema.name }],
                        phones: [{
                            type: phonesSchema.name,
                            fields: {
                                [EmptyKey]: [
                                    // { type: stringSchema.name, value: "+49123456778" },
                                    // { type: int32Schema.name, value: 123456879 },
                                    { type: complexPhoneSchema.name, fields: {
                                        prefix: [{ value: "123", type: stringSchema.name }],
                                        number: [{ value: "11111111", type: stringSchema.name }],
                                        kind: [{ value: "mobile", type: stringSchema.name }],
                                    } },
                                    { type: complexPhoneSchema.name, fields: {
                                        prefix: [{ value: "456", type: stringSchema.name }],
                                        number: [{ value: "11111111", type: stringSchema.name }],
                                        kind: [{ value: "home", type: stringSchema.name }],
                                    } },
                                    { type: complexPhoneSchema.name, fields: {
                                        prefix: [{ value: "789", type: stringSchema.name }],
                                        number: [{ value: "11111111", type: stringSchema.name }],
                                        kind: [{ value: "mobile", type: stringSchema.name }],
                                    } },
                                ],
                            },
                        }],
                    },
                    type: addressSchema.name,
                }],
            },
        };

        // Init
        tree1.runTransaction((forest, editor) => {
            editor.insert({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, singleTextCursor(person));
            return TransactionResult.Apply;
        });

        await provider.ensureSynchronized();

        tree2.runTransaction((forest, editor) => {
            const rootPath: UpPath = {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            };
            const phoneListPath = upPathUnder(rootPath, [
                ["address", 0],
                ["phones", 0],
            ]);
            const phone1TypePath = upPathUnder(phoneListPath, [
                [EmptyKey, 0],
                ["kind", 0],
            ]);
            const phone2TypePath = upPathUnder(phoneListPath, [
                [EmptyKey, 1],
                ["kind", 0],
            ]);
            editor.setValue(phone1TypePath, "work");
            editor.setValue(phone2TypePath, "mobile");
            editor.insert(
                upPathUnder(phoneListPath, [[EmptyKey, 0]]),
                singleTextCursor({ type: complexPhoneSchema.name, fields: {
                    prefix: [{ value: "000", type: stringSchema.name }],
                    number: [{ value: "11111111", type: stringSchema.name }],
                    kind: [{ value: "mobile", type: stringSchema.name }],
                } },
            ));
            return TransactionResult.Apply;
        });

        tree1.runTransaction((forest, editor) => {
            const rootPath: UpPath = {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            };
            const phonesPath = upPathUnder(rootPath, [
                ["address", 0],
                ["phones", 0],
            ]);
            editor.xForm(phonesPath, `$ ~> | fields."".fields.kind[value = "mobile"] | { "value": "cell" } |`);
            return TransactionResult.Apply;
        });

        await provider.ensureSynchronized();

        // Validate outcome
        {
            const readCursor = tree2.forest.allocateCursor();
            const destination = tree2.forest.root(tree2.forest.rootField);
            const cursorResult = tree2.forest.tryMoveCursorTo(destination, readCursor);
            assert.equal(cursorResult, TreeNavigationResult.Ok);
            const jsonIn = jsonableTreeFromCursor(readCursor);
            const expected: JsonableTree = {
                type: personSchema.name,
                fields: {
                    name: [{ value: "Adam", type: stringSchema.name }],
                    age: [{ value: 35, type: int32Schema.name }],
                    salary: [{ value: 10420.2, type: float32Schema.name }],
                    friends: [{ fields: {
                        Mat: [{ type: stringSchema.name, value: "Mat" }],
                    }, type: mapStringSchema.name }],
                    address: [{
                        fields: {
                            street: [{ value: "treeStreet", type: stringSchema.name }],
                            phones: [{
                                type: phonesSchema.name,
                                fields: {
                                    [EmptyKey]: [
                                        { type: complexPhoneSchema.name, fields: {
                                            prefix: [{ value: "000", type: stringSchema.name }],
                                            number: [{ value: "11111111", type: stringSchema.name }],
                                            kind: [{ value: "cell", type: stringSchema.name }],
                                        } },
                                        { type: complexPhoneSchema.name, fields: {
                                            prefix: [{ value: "123", type: stringSchema.name }],
                                            number: [{ value: "11111111", type: stringSchema.name }],
                                            kind: [{ value: "work", type: stringSchema.name }],
                                        } },
                                        { type: complexPhoneSchema.name, fields: {
                                            prefix: [{ value: "456", type: stringSchema.name }],
                                            number: [{ value: "11111111", type: stringSchema.name }],
                                            kind: [{ value: "cell", type: stringSchema.name }],
                                        } },
                                        { type: complexPhoneSchema.name, fields: {
                                            prefix: [{ value: "789", type: stringSchema.name }],
                                            number: [{ value: "11111111", type: stringSchema.name }],
                                            kind: [{ value: "cell", type: stringSchema.name }],
                                        } },
                                    ],
                                },
                            }],
                        },
                        type: addressSchema.name,
                    }],
                },
            };
            assert.deepEqual(jsonIn, expected);
            readCursor.free();
            tree2.forest.forgetAnchor(destination);
        }
    });
});

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function setTestValue(tree: ISharedTree, value: TreeValue): void {
    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        editor.insert({
            parent: undefined,
            parentField: detachedFieldAsKey(forest.rootField),
            parentIndex: 0,
        }, writeCursor);

        return TransactionResult.Apply;
    });
}

/**
 * Reads a value in a tree set by {@link setTestValue} if it exists
 */
function getTestValue({ forest }: ISharedTree): TreeValue | undefined {
    const readCursor = forest.allocateCursor();
    const destination = forest.root(forest.rootField);
    const cursorResult = forest.tryMoveCursorTo(destination, readCursor);
    const { value } = readCursor;
    readCursor.free();
    forest.forgetAnchor(destination);
    if (cursorResult === TreeNavigationResult.Ok) {
        return value;
    }

    return undefined;
}
