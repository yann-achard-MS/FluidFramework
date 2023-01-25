/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { singleTextCursor } from "../../feature-libraries";
import { FieldKey, Delta, DeltaVisitor, visitDelta } from "../../core";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

function visit(delta: Delta.Root, visitor: DeltaVisitor): void {
    deepFreeze(delta);
    visitDelta(delta, visitor);
}

type CallSignatures<T> = {
    [K in keyof T]: T[K] extends (...args: any) => any ? [K, ...Parameters<T[K]>] : never;
};
type PropType<T> = T[keyof T];
type VisitCall = PropType<CallSignatures<DeltaVisitor>>;
type VisitScript = VisitCall[];

const visitorMethods: (keyof DeltaVisitor)[] = [
    "onDelete",
    "onInsert",
    "onMoveOut",
    "onMoveIn",
    "onSetValue",
    "enterNode",
    "exitNode",
    "enterField",
    "exitField",
];

function testVisit(delta: Delta.Root, expected: Readonly<VisitScript>): void {
    let callIndex = 0;
    const makeChecker =
        (name: string) =>
        (...args: unknown[]) => {
            assert.deepStrictEqual([name, ...args], expected[callIndex]);
            callIndex += 1;
        };
    const visitor: DeltaVisitor = {} as any;
    for (const methodName of visitorMethods) {
        visitor[methodName] = makeChecker(methodName);
    }
    visit(delta, visitor);
    assert.strictEqual(callIndex, expected.length);
}

function testTreeVisit(delta: Delta.FieldChanges, expected: Readonly<VisitScript>): void {
    testVisit(new Map([[rootKey, delta]]), [
        ["enterField", rootKey],
        ...expected,
        ["exitField", rootKey],
    ]);
}

const rootKey: FieldKey = brand("root");
const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const nodeX = { type: jsonString.name, value: "X" };
const content = [singleTextCursor(nodeX)];

describe("visit", () => {
    it("empty delta", () => {
        const delta = {};
        testTreeVisit(delta, []);
    });

    it("set root value", () => {
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, { setValue: 1 }]],
        };
        const expected: VisitScript = [
            ["enterNode", 0],
            ["onSetValue", 1],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("set child value", () => {
        const delta: Delta.FieldChanges = {
            nestedChanges: [
                [
                    { context: Delta.Context.Input, index: 0 },
                    {
                        fields: new Map([
                            [
                                fooKey,
                                {
                                    nestedChanges: [
                                        [
                                            { context: Delta.Context.Input, index: 42 },
                                            { setValue: 1 },
                                        ],
                                    ],
                                },
                            ],
                        ]),
                    },
                ],
            ],
        };
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["enterNode", 42],
            ["onSetValue", 1],
            ["exitNode", 42],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("insert root", () => {
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const delta: Delta.FieldChanges = {
            siblingChanges: [mark],
        };
        testTreeVisit(delta, [["onInsert", 0, content]]);
    });

    it("insert child", () => {
        const mark = {
            type: Delta.MarkType.Insert,
            content,
        };
        const node: Delta.NodeChanges = {
            fields: new Map([
                [
                    fooKey,
                    {
                        siblingChanges: [mark],
                    },
                ],
            ]),
        };
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, node]],
        };
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onInsert", 42, content],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("delete root", () => {
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const delta: Delta.FieldChanges = {
            siblingChanges: [mark],
        };
        testTreeVisit(delta, [["onDelete", 0, 10]]);
    });

    it("delete child", () => {
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const node: Delta.NodeChanges = {
            fields: new Map([[fooKey, { siblingChanges: [42, mark] }]]),
        };
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onDelete", 42, 10],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, node]],
        };
        testTreeVisit(delta, expected);
    });

    it("the lot on a field", () => {
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const set: Delta.NodeChanges = {
            setValue: 1,
        };
        const nodeChanges: Delta.NodeChanges = {
            fields: new Map([
                [
                    fooKey,
                    {
                        siblingChanges: [del, 3, ins],
                        nestedChanges: [[{ context: Delta.Context.Input, index: 14 }, set]],
                    },
                ],
            ]),
        };
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, nodeChanges]],
        };
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onDelete", 0, 10],
            ["onInsert", 3, content],
            ["enterNode", 5],
            ["onSetValue", 1],
            ["exitNode", 5],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("move children to the right", () => {
        const moveId: Delta.MoveId = brand(1);
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            count: 2,
            moveId,
        };

        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            count: 2,
            moveId,
        };

        const nodeChanges: Delta.NodeChanges = {
            fields: new Map([
                [
                    rootKey,
                    {
                        nestedChanges: [
                            [
                                { context: Delta.Context.Input, index: 0 },
                                {
                                    fields: new Map([
                                        [fooKey, { siblingChanges: [2, moveOut, 3, moveIn] }],
                                    ]),
                                },
                            ],
                        ],
                    },
                ],
            ]),
        };
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, nodeChanges]],
        };

        const expected: VisitScript = [
            // Added by testTreeVisit
            // ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveOut", 2, 2, moveId],
            ["exitField", fooKey],
            ["exitNode", 0],
            ["exitField", rootKey],
            ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveIn", 5, 2, moveId],
            ["exitField", fooKey],
            ["exitNode", 0],
            // Added by testTreeVisit
            // ["exitField", rootKey],
        ];

        testTreeVisit(delta, expected);
    });

    it("move children to the left", () => {
        const moveId: Delta.MoveId = brand(1);
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            count: 2,
            moveId,
        };

        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            count: 2,
            moveId,
        };

        const nodeChanges: Delta.NodeChanges = {
            fields: new Map([
                [
                    rootKey,
                    {
                        nestedChanges: [
                            [
                                { context: Delta.Context.Input, index: 0 },
                                {
                                    fields: new Map([
                                        [fooKey, { siblingChanges: [2, moveIn, 3, moveOut] }],
                                    ]),
                                },
                            ],
                        ],
                    },
                ],
            ]),
        };
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, nodeChanges]],
        };

        const expected: VisitScript = [
            // Added by testTreeVisit
            // ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveOut", 5, 2, moveId],
            ["exitField", fooKey],
            ["exitNode", 0],
            ["exitField", rootKey],
            ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveIn", 2, 2, moveId],
            ["exitField", fooKey],
            ["exitNode", 0],
            // Added by testTreeVisit
            // ["exitField", rootKey],
        ];

        testTreeVisit(delta, expected);
    });

    it("move cousins", () => {
        const moveId: Delta.MoveId = brand(1);
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            count: 2,
            moveId,
        };

        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            count: 2,
            moveId,
        };

        const nodeChanges: Delta.NodeChanges = {
            fields: new Map([
                [fooKey, { siblingChanges: [moveIn] }],
                [barKey, { siblingChanges: [moveOut] }],
            ]),
        };
        const delta: Delta.FieldChanges = {
            nestedChanges: [[{ context: Delta.Context.Input, index: 0 }, nodeChanges]],
        };

        const expected: VisitScript = [
            // Added by testTreeVisit
            // ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["exitField", fooKey],
            ["enterField", barKey],
            ["onMoveOut", 0, 2, moveId],
            ["exitField", barKey],
            ["exitNode", 0],
            ["exitField", rootKey],
            ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveIn", 0, 2, moveId],
            ["exitField", fooKey],
            ["enterField", barKey],
            ["exitField", barKey],
            ["exitNode", 0],
            // Added by testTreeVisit
            // ["exitField", rootKey],
        ];

        testTreeVisit(delta, expected);
    });
});
