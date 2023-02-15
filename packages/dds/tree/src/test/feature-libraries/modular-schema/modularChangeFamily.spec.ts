/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ModularChangeFamily,
	NodeChangeset,
	FieldChange,
	ModularChangeset,
	ChangesetLocalId,
	FieldChangeMap,
} from "../../../feature-libraries";
import {
	RepairDataStore,
	makeAnonChange,
	RevisionTag,
	tagChange,
	TaggedChange,
	AnchorSet,
	Delta,
	FieldKey,
	UpPath,
} from "../../../core";
import { brand } from "../../../util";
import { assertDeltaEqual, deepFreeze, noRepair } from "../../utils";
import {
	AddDelChangeset,
	addDelField,
	idField,
	nestedAddDelChange,
	nestedGenericChange,
	nestedSingleNodeChange,
	nestedValueChange,
	testFieldKinds,
	ValueChangeset,
	valueField,
} from "./testFieldKinds";

const family = new ModularChangeFamily(testFieldKinds);

const tag1: RevisionTag = brand(1);
const tag2: RevisionTag = brand(2);

const fieldA: FieldKey = brand("a");
const fieldB: FieldKey = brand("b");

const valueChange1a: ValueChangeset = { old: 0, new: 1 };
const valueChange1b: ValueChangeset = { old: 0, new: 2 };
const valueChange2: ValueChangeset = { old: 1, new: 2 };

const valueInverse1: ValueChangeset = { old: 1, new: 0 };
const valueInverse2: ValueChangeset = { old: 2, new: 1 };

const nodeInverse: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueInverse1),
			},
		],
	]),
};

const valueChangeFieldA: FieldChangeMap = new Map([
	[fieldA, { fieldKind: valueField.identifier, shallow: brand(valueChange1a) }],
]);

const inverseValueChangeFieldA: FieldChangeMap = new Map([
	[fieldA, { fieldKind: valueField.identifier, shallow: brand(valueInverse1) }],
]);

const nodeChange1a: NodeChangeset = {
	fieldChanges: valueChangeFieldA,
};

const inverseNodeChange1a: NodeChangeset = {
	fieldChanges: inverseValueChangeFieldA,
};

const nodeChanges1b: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueChange1b),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueChange1a),
			},
		],
	]),
};

const nodeChanges2: NodeChangeset = {
	fieldChanges: new Map([
		[
			fieldA,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueChange2),
			},
		],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueChange1a),
			},
		],
	]),
};

const rootChange1a: ModularChangeset = {
	changes: new Map([
		[fieldA, nestedSingleNodeChange(nodeChange1a)],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueChange2),
			},
		],
	]),
};

const rootChange1aGeneric: ModularChangeset = {
	changes: new Map([
		[fieldA, nestedGenericChange(0, nodeChange1a)],
		[
			fieldB,
			{
				fieldKind: valueField.identifier,
				shallow: brand(valueChange2),
			},
		],
	]),
};

const rootChange1b: ModularChangeset = {
	changes: new Map([[fieldA, nestedSingleNodeChange(nodeChanges1b)]]),
};

const rootChange1bGeneric: ModularChangeset = {
	changes: new Map([[fieldA, nestedGenericChange(0, nodeChanges1b)]]),
};

const rootChange2: ModularChangeset = {
	changes: new Map([[fieldA, nestedSingleNodeChange(nodeChanges2)]]),
};

const rootChange2Generic: ModularChangeset = {
	changes: new Map([[fieldA, nestedGenericChange(0, nodeChanges2)]]),
};

const testValue = "Test Value";
const nodeValueOverwrite: ModularChangeset = {
	changes: new Map([[fieldA, nestedGenericChange(0, { valueChange: { value: testValue } })]]),
};

const detachedBy: RevisionTag = brand(42);
const nodeValueRevert: ModularChangeset = {
	changes: new Map([[fieldA, nestedGenericChange(0, { valueChange: { revert: detachedBy } })]]),
};

function addDelShallowChange(count: number): ModularChangeset {
	const change: AddDelChangeset = count >= 0 ? { add: count, del: 0 } : { add: 0, del: -count };
	return {
		changes: new Map([[fieldA, { fieldKind: addDelField.identifier, shallow: brand(change) }]]),
	};
}

describe("ModularChangeFamily", () => {
	describe("compose changes", () => {
		const composedValues: ValueChangeset = { old: 0, new: 2 };

		const composedNodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[
					fieldA,
					{
						fieldKind: valueField.identifier,
						shallow: brand(composedValues),
					},
				],
				[
					fieldB,
					{
						fieldKind: valueField.identifier,
						shallow: brand(valueChange1a),
					},
				],
			]),
		};

		it("compose specific ○ specific", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[fieldA, nestedSingleNodeChange(composedNodeChange)],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							shallow: brand(valueChange2),
						},
					],
				]),
			};
			const actual = family.compose([
				makeAnonChange(rootChange1a),
				makeAnonChange(rootChange2),
			]);
			assert.deepEqual(actual, expectedCompose);
		});

		it("compose specific ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[fieldA, nestedSingleNodeChange(composedNodeChange)],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							shallow: brand(valueChange2),
						},
					],
				]),
			};
			const actual = family.compose([
				makeAnonChange(rootChange1a),
				makeAnonChange(rootChange2Generic),
			]);
			assert.deepEqual(actual, expectedCompose);
		});

		it("compose generic ○ specific", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[fieldA, nestedSingleNodeChange(composedNodeChange)],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							shallow: brand(valueChange2),
						},
					],
				]),
			};
			const actual = family.compose([
				makeAnonChange(rootChange1aGeneric),
				makeAnonChange(rootChange2),
			]);
			assert.deepEqual(actual, expectedCompose);
		});

		it("compose generic ○ generic", () => {
			const expectedCompose: ModularChangeset = {
				changes: new Map([
					[fieldA, nestedGenericChange(0, composedNodeChange)],
					[
						fieldB,
						{
							fieldKind: valueField.identifier,
							shallow: brand(valueChange2),
						},
					],
				]),
			};
			assert.deepEqual(
				family.compose([
					makeAnonChange(rootChange1aGeneric),
					makeAnonChange(rootChange2Generic),
				]),
				expectedCompose,
			);
		});

		it("compose tagged changes", () => {
			const change1A: FieldChange = {
				fieldKind: valueField.identifier,
				shallow: brand(valueChange1a),
			};

			const value1 = "Value 1";
			const nodeChange1: NodeChangeset = {
				valueChange: { value: value1 },
			};

			const change1B: FieldChange = nestedSingleNodeChange(nodeChange1);

			const change1: TaggedChange<ModularChangeset> = tagChange(
				{
					changes: new Map([
						[fieldA, change1A],
						[fieldB, change1B],
					]),
				},
				tag1,
			);

			const nodeChange2: NodeChangeset = {
				fieldChanges: new Map([
					[
						fieldA,
						{
							fieldKind: valueField.identifier,
							shallow: brand(valueChange2),
						},
					],
				]),
			};

			const change2B: FieldChange = nestedSingleNodeChange(nodeChange2);

			deepFreeze(change2B);
			const change2: TaggedChange<ModularChangeset> = tagChange(
				{
					changes: new Map([[fieldB, change2B]]),
				},
				tag2,
			);

			deepFreeze(change1);
			deepFreeze(change2);
			const composed = family.compose([change1, change2]);

			const expectedNodeChange: NodeChangeset = {
				valueChange: { revision: change1.revision, value: value1 },
				fieldChanges: new Map([
					[
						fieldA,
						{
							revision: change2.revision,
							fieldKind: valueField.identifier,
							shallow: brand(valueChange2),
						},
					],
				]),
			};

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							revision: change1.revision,
							fieldKind: valueField.identifier,
							shallow: brand(valueChange1a),
						},
					],
					[fieldB, nestedSingleNodeChange(expectedNodeChange)],
				]),
			};

			assert.deepEqual(composed, expected);
		});

		it("generate IDs", () => {
			const id0: ChangesetLocalId = brand(0);
			const id1: ChangesetLocalId = brand(1);
			const change1: ModularChangeset = {
				maxId: id0,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id0) }],
				]),
			};

			const change2: ModularChangeset = {
				maxId: id0,
				changes: new Map([
					[fieldB, { fieldKind: idField.identifier, shallow: brand(id0) }],
				]),
			};

			const expected1: ModularChangeset = {
				maxId: id0,
				changes: new Map([
					[
						fieldA,
						{ fieldKind: idField.identifier, revision: tag1, shallow: brand(id0) },
					],
					[
						fieldB,
						{ fieldKind: idField.identifier, revision: tag2, shallow: brand(id0) },
					],
				]),
			};

			const composed1 = family.compose([tagChange(change1, tag1), tagChange(change2, tag2)]);
			assert.deepEqual(composed1, expected1);

			const expected2: ModularChangeset = {
				maxId: id1,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id1) }],
				]),
			};

			const composed2 = family.compose([tagChange(change1, tag1), tagChange(change1, tag2)]);
			assert.deepEqual(composed2, expected2);
		});
	});

	describe("compose anchors", () => {
		it("value anchor ○ value change", () => {
			const fst: ModularChangeset = {
				changes: new Map([[fieldA, nestedValueChange(nodeChange1a)]]),
			};
			const snd: ModularChangeset = {
				changes: new Map([
					[fieldA, { fieldKind: valueField.identifier, shallow: brand(valueChange1a) }],
				]),
			};

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							...nestedValueChange(nodeChange1a),
							shallow: brand(valueChange1a),
							revision: tag2,
						},
					],
				]),
			};

			const actual = family.compose([tagChange(fst, tag1), tagChange(snd, tag2)]);
			assert.deepEqual(actual, expected);
		});

		it("value change ○ value anchor", () => {
			const fst: ModularChangeset = {
				changes: new Map([
					[fieldA, { fieldKind: valueField.identifier, shallow: brand(valueChange1a) }],
				]),
			};
			const snd: ModularChangeset = {
				changes: new Map([[fieldA, nestedValueChange(nodeChange1a)]]),
			};

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							...nestedValueChange(nodeChange1a),
							shallow: brand(valueChange1a),
							revision: tag1,
						},
					],
				]),
			};

			const actual = family.compose([tagChange(fst, tag1), tagChange(snd, tag2)]);
			assert.deepEqual(actual, expected);
		});

		it("AddDel anchor ○ AddDel change => anchor preserved", () => {
			const fst: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(0, nodeChange1a)]]),
			};
			const snd: ModularChangeset = addDelShallowChange(-1);

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							...nestedAddDelChange(0, nodeChange1a),
							shallow: brand({ add: 0, del: 1 }),
							revision: tag2,
						},
					],
				]),
			};

			const actual = family.compose([tagChange(fst, tag1), tagChange(snd, tag2)]);
			assert.deepEqual(actual, expected);
		});

		it("AddDel change ○ AddDel anchor => anchor loss", () => {
			const fst: ModularChangeset = addDelShallowChange(1);
			const snd: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(0, nodeChange1a)]]),
			};

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							fieldKind: addDelField.identifier,
							shallow: brand({ add: 1, del: 0 }),
							revision: tag1,
						},
					],
				]),
			};

			const actual = family.compose([tagChange(fst, tag1), tagChange(snd, tag2)]);
			assert.deepEqual(actual, expected);
		});

		it("AddDel change ○ AddDel anchor => anchor shift", () => {
			const fst: ModularChangeset = addDelShallowChange(1);
			const snd: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(1, nodeChange1a)]]),
			};

			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							...nestedAddDelChange(0, nodeChange1a),
							shallow: brand({ add: 1, del: 0 }),
							revision: tag1,
						},
					],
				]),
			};

			const actual = family.compose([tagChange(fst, tag1), tagChange(snd, tag2)]);
			assert.deepEqual(actual, expected);
		});
	});

	describe("invert changes", () => {
		it("specific", () => {
			const expectedInverse: ModularChangeset = {
				changes: new Map([
					[fieldA, nestedSingleNodeChange(nodeInverse)],
					[fieldB, { fieldKind: valueField.identifier, shallow: brand(valueInverse2) }],
				]),
			};

			const actual = family.invert(makeAnonChange(rootChange1a));
			assert.deepEqual(actual, expectedInverse);
		});

		it("generic", () => {
			const expectedInverse: ModularChangeset = {
				changes: new Map([
					[fieldA, nestedGenericChange(0, nodeInverse)],
					[fieldB, { fieldKind: valueField.identifier, shallow: brand(valueInverse2) }],
				]),
			};

			const actual = family.invert(makeAnonChange(rootChange1aGeneric));
			assert.deepEqual(actual, expectedInverse);
		});

		it("generate IDs", () => {
			const id0: ChangesetLocalId = brand(0);
			const id1: ChangesetLocalId = brand(1);
			const id2: ChangesetLocalId = brand(2);
			const id3: ChangesetLocalId = brand(3);
			const change: ModularChangeset = {
				maxId: id1,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id0) }],
					[fieldB, { fieldKind: idField.identifier, shallow: brand(id1) }],
				]),
			};

			const expected: ModularChangeset = {
				maxId: id3,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id2) }],
					[fieldB, { fieldKind: idField.identifier, shallow: brand(id3) }],
				]),
			};

			const actual = family.invert(makeAnonChange(change));
			assert.deepEqual(actual, expected);
		});
	});

	describe("invert anchors", () => {
		it("value change anchor", () => {
			const input: ModularChangeset = {
				changes: new Map([[fieldA, nestedValueChange(nodeChange1a)]]),
			};
			const expected: ModularChangeset = {
				changes: new Map([[fieldA, nestedValueChange(inverseNodeChange1a)]]),
			};

			const actual = family.invert(makeAnonChange(input));
			assert.deepEqual(actual, expected);
		});

		it("AddDel change anchor", () => {
			const input: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							...nestedAddDelChange(2, nodeChange1a),
							shallow: brand({ add: 1, del: 0 }),
						},
					],
				]),
			};
			const expected: ModularChangeset = {
				changes: new Map([
					[
						fieldA,
						{
							...nestedAddDelChange(3, inverseNodeChange1a),
							shallow: brand({ add: 0, del: 1 }),
						},
					],
				]),
			};

			const actual = family.invert(makeAnonChange(input));
			assert.deepEqual(actual, expected);
		});

		it("generic anchor", () => {
			const input: ModularChangeset = {
				changes: new Map([[fieldA, nestedGenericChange(0, nodeChange1a)]]),
			};
			const expected: ModularChangeset = {
				changes: new Map([[fieldA, nestedGenericChange(0, inverseNodeChange1a)]]),
			};

			const actual = family.invert(makeAnonChange(input));
			assert.deepEqual(actual, expected);
		});
	});

	describe("rebase changes", () => {
		it("rebase specific ↷ specific", () => {
			const actual = family.rebase(rootChange1b, makeAnonChange(rootChange1a));
			assert.deepEqual(actual, rootChange2);
		});

		it("rebase specific ↷ generic", () => {
			const actual = family.rebase(rootChange1b, makeAnonChange(rootChange1aGeneric));
			assert.deepEqual(actual, rootChange2);
		});

		it("rebase generic ↷ specific", () => {
			const actual = family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1a));
			assert.deepEqual(actual, rootChange2);
		});

		it("rebase generic ↷ generic", () => {
			const actual = family.rebase(rootChange1bGeneric, makeAnonChange(rootChange1aGeneric));
			assert.deepEqual(actual, rootChange2Generic);
		});

		it("generate IDs", () => {
			const id0: ChangesetLocalId = brand(0);
			const id1: ChangesetLocalId = brand(1);
			const id2: ChangesetLocalId = brand(2);
			const id3: ChangesetLocalId = brand(3);
			const change: ModularChangeset = {
				maxId: id1,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id0) }],
					[fieldB, { fieldKind: idField.identifier, shallow: brand(id1) }],
				]),
			};

			const base: ModularChangeset = {
				maxId: id0,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id0) }],
				]),
			};

			const expected: ModularChangeset = {
				maxId: id2,
				changes: new Map([
					[fieldA, { fieldKind: idField.identifier, shallow: brand(id2) }],
					[fieldB, { fieldKind: idField.identifier, shallow: brand(id1) }],
				]),
			};

			assert.deepEqual(family.rebase(change, makeAnonChange(base)), expected);
		});
	});

	describe("rebase anchors", () => {
		it("rebase specific ↷ value change => no shift", () => {
			const actual = family.rebase(
				rootChange1b,
				makeAnonChange({ changes: valueChangeFieldA }),
			);
			assert.deepEqual(actual, rootChange1b);
		});

		it("rebase generic ↷ value change => no shift", () => {
			const actual = family.rebase(
				rootChange1bGeneric,
				makeAnonChange({ changes: valueChangeFieldA }),
			);

			// The anchor gets converted into the field-specific representation
			const expected: ModularChangeset = {
				changes: new Map([[fieldA, nestedValueChange(nodeChanges1b)]]),
			};
			assert.deepEqual(actual, expected);
		});

		it("rebase specific ↷ AddDel change => anchor loss", () => {
			const specific: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(0, nodeChanges1b)]]),
			};

			const actual = family.rebase(specific, makeAnonChange(addDelShallowChange(-1)));
			assert.deepEqual(actual, { changes: new Map() });
		});

		it("rebase generic ↷ AddDel change => anchor loss", () => {
			const actual = family.rebase(
				rootChange1bGeneric,
				makeAnonChange(addDelShallowChange(-1)),
			);
			assert.deepEqual(actual, { changes: new Map() });
		});

		it("rebase specific ↷ AddDel change => anchor shift", () => {
			const specific: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(2, nodeChanges1b)]]),
			};

			const actual = family.rebase(specific, makeAnonChange(addDelShallowChange(3)));
			const expected: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(5, nodeChanges1b)]]),
			};
			assert.deepEqual(actual, expected);
		});

		it("rebase generic ↷ AddDel change => anchor shift", () => {
			const generic: ModularChangeset = {
				changes: new Map([[fieldA, nestedGenericChange(2, nodeChanges1b)]]),
			};
			const actual = family.rebase(generic, makeAnonChange(addDelShallowChange(3)));
			// The anchor gets converted into the field-specific representation
			const expected: ModularChangeset = {
				changes: new Map([[fieldA, nestedAddDelChange(5, nodeChanges1b)]]),
			};
			assert.deepEqual(actual, expected);
		});
	});

	describe("intoDelta", () => {
		it("fieldChanges", () => {
			const innerFieldADelta: Delta.FieldChanges = {
				shallow: valueField.changeHandler.intoDelta(valueChange1a, noRepair),
			};
			const outerFieldADelta: Delta.FieldChanges = {
				afterShallow: [{ index: 0, fields: new Map([[fieldA, innerFieldADelta]]) }],
			};
			const fieldBDelta: Delta.FieldChanges = {
				shallow: valueField.changeHandler.intoDelta(valueChange2, noRepair),
			};
			const expectedDelta: Delta.Root = new Map([
				[fieldA, outerFieldADelta],
				[fieldB, fieldBDelta],
			]);

			const actual = family.intoDelta(rootChange1a);
			assertDeltaEqual(actual, expectedDelta);
		});

		it("value overwrite", () => {
			const fieldADelta: Delta.FieldChanges = {
				beforeShallow: [{ index: 0, setValue: testValue }],
			};
			const expectedDelta: Delta.Root = new Map([[fieldA, fieldADelta]]);
			assertDeltaEqual(family.intoDelta(nodeValueOverwrite), expectedDelta);
		});

		it("value revert", () => {
			const fieldADelta: Delta.FieldChanges = {
				beforeShallow: [{ index: 0, setValue: testValue }],
			};
			const expectedDelta: Delta.Root = new Map([[fieldA, fieldADelta]]);
			const repair: RepairDataStore = {
				capture: (TreeDestruction) => assert.fail(),
				getNodes: () => assert.fail(),
				getValue: (revision, path) => {
					assert.equal(revision, detachedBy);
					assert.deepEqual(path, {
						parent: undefined,
						parentField: fieldA,
						parentIndex: 0,
					});
					return testValue;
				},
			};
			const actual = family.intoDelta(nodeValueRevert, repair);
			assertDeltaEqual(actual, expectedDelta);
		});
	});

	it("Json encoding", () => {
		const version = 0;
		const encoded = JSON.stringify(family.encoder.encodeForJson(version, rootChange1a));
		const decoded = family.encoder.decodeJson(version, JSON.parse(encoded));
		assert.deepEqual(decoded, rootChange1a);
	});

	it("build child change", () => {
		const editor = family.buildEditor((edit) => {}, new AnchorSet());
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.submitChange(path, fieldB, valueField.identifier, brand(valueChange1a));
		const changes = editor.getChanges();
		const nodeChange: NodeChangeset = {
			fieldChanges: new Map([
				[fieldB, { fieldKind: valueField.identifier, shallow: brand(valueChange1a) }],
			]),
		};

		const expectedChange: ModularChangeset = {
			changes: new Map([[fieldA, nestedGenericChange(0, nodeChange)]]),
		};

		assert.deepEqual(changes, [expectedChange]);
	});

	it("build value change", () => {
		const editor = family.buildEditor((edit) => {}, new AnchorSet());
		const path: UpPath = {
			parent: undefined,
			parentField: fieldA,
			parentIndex: 0,
		};

		editor.setValue(path, testValue);
		const changes = editor.getChanges();
		assert.deepEqual(changes, [nodeValueOverwrite]);
	});
});
