/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    emptyField,
    FieldKinds,
    jsonableTreeFromCursor,
    singleTextCursor,
    Transposed as T,
} from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey, EmptyKey, JsonableTree, rootFieldKey, TreeValue, UpPath, upPathUnder, Value } from "../../tree";
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
    it("can apply an abstract edit", async () => {
        const provider = await TestTreeProvider.create(2);
        const [client1, client2] = provider.trees;

        const person: JsonableTree = {
            type: personSchema.name,
            fields: {
                address: [{
                    fields: {
                        phones: [{
                            type: phonesSchema.name,
                            fields: {
                                [EmptyKey]: [
                                    { type: complexPhoneSchema.name, fields: {
                                        number: [{ value: "B", type: stringSchema.name }],
                                        kind: [{ value: "mobile", type: stringSchema.name }],
                                    } },
                                    { type: complexPhoneSchema.name, fields: {
                                        number: [{ value: "C", type: stringSchema.name }],
                                        kind: [{ value: "home", type: stringSchema.name }],
                                    } },
                                    { type: complexPhoneSchema.name, fields: {
                                        number: [{ value: "D", type: stringSchema.name }],
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

        // Init document with person tree
        client1.runTransaction((forest, editor) => {
            editor.insert({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, singleTextCursor(person));
            return TransactionResult.Apply;
        });

        await provider.ensureSynchronized();

        // Make all kinds of changes to the person tree
        client2.runTransaction((forest, editor) => {
            const rootPath: UpPath = {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            };
            const addressPath = upPathUnder(rootPath, [
                ["address", 0],
            ]);
            const phoneListPath = upPathUnder(addressPath, [
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
                    number: [{ value: "A", type: stringSchema.name }],
                    kind: [{ value: "mobile", type: stringSchema.name }],
                } },
            ));
            editor.insert(
                addressPath,
                singleTextCursor({
                    type: addressSchema.name,
                },
            ));
            return TransactionResult.Apply;
        });

        // Update "mobile" phone kind to "cell"
        client1.runTransaction((forest, editor) => {
            const rootPath: UpPath = {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            };
            const phonesPath = upPathUnder(rootPath, [
                ["address", 0],
                ["phones", 0],
            ]);
            const changeOp = arrayEdit({
                select: fieldPredicate({ kind: valueIsEq(`"mobile"`) }),
                change: fieldEdit({ kind: setValue(`"cell"`) }),
            });
            editor.abstractChange(phonesPath, changeOp);
            const sentString = `
                {
                    "type": "Modify",
                    "fields": {
                        "": fields."".(
                            fields.kind.value[0] = "mobile"
                            ? {
                                "type": "Modify",
                                "fields": {
                                    "kind": [{
                                        "type": "Modify",
                                        "value": { "id": 0, "value": "cell" }
                                    }]
                                }
                            }
                            : 1
                        )
                    }
                }
            `;
            return TransactionResult.Apply;
        });

        await provider.ensureSynchronized();

        // Validate outcome
        {
            const readCursor = client2.forest.allocateCursor();
            const destination = client2.forest.root(client2.forest.rootField);
            const cursorResult = client2.forest.tryMoveCursorTo(destination, readCursor);
            assert.equal(cursorResult, TreeNavigationResult.Ok);
            const jsonIn = jsonableTreeFromCursor(readCursor);
            const expected: JsonableTree = {
                type: personSchema.name,
                fields: {
                    address: [
                        {
                            type: addressSchema.name,
                        },
                        {
                            fields: {
                                phones: [{
                                    type: phonesSchema.name,
                                    fields: {
                                        [EmptyKey]: [
                                            { type: complexPhoneSchema.name, fields: {
                                                number: [{ value: "A", type: stringSchema.name }],
                                                kind: [{ value: "cell", type: stringSchema.name }],
                                            } },
                                            { type: complexPhoneSchema.name, fields: {
                                                number: [{ value: "B", type: stringSchema.name }],
                                                kind: [{ value: "work", type: stringSchema.name }],
                                            } },
                                            { type: complexPhoneSchema.name, fields: {
                                                number: [{ value: "C", type: stringSchema.name }],
                                                kind: [{ value: "cell", type: stringSchema.name }],
                                            } },
                                            { type: complexPhoneSchema.name, fields: {
                                                number: [{ value: "D", type: stringSchema.name }],
                                                kind: [{ value: "cell", type: stringSchema.name }],
                                            } },
                                        ],
                                    },
                                }],
                            },
                            type: addressSchema.name,
                        },
                    ],
                },
            };
            assert.deepEqual(jsonIn, expected);
            readCursor.free();
            client2.forest.forgetAnchor(destination);
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

function arrayEdit({ select: filter, change }: { select: string; change: string; }): string {
    return `
        {
            "type": "Modify",
            "fields": {
                "": fields."".(
                    ${filter}
                    ? ${change}
                    : 1
                )
            }
        }
    `;
}

function fieldEdit(fields: Record<string, string>) {
    const changes: string[] = [];
    for (const key of Object.keys(fields)) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            changes.push(`"${key}": ${fields[key]}`);
        }
    }
    return `{
        "type": "Modify",
        "fields": {
            ${changes.join(",\n")}
        }
    }`;
}

function valueIsEq(value: string): string {
    return `value[0] = ${value}`;
}

function fieldPredicate(fields: Record<string, string>) {
    const changes: string[] = [];
    for (const key of Object.keys(fields)) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            changes.push(`${key}.${fields[key]}`);
        }
    }
    assert.equal(changes.length, 1);
    return `fields.${changes[0]}`;
}

function setValue(value: string) {
    return `[{
        "type": "Modify",
        "value": { "id": 0, "value": ${value} }
    }]`;
}
