/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	NodeChangeset,
	GenericChangeset,
	genericFieldKind,
	IdAllocator,
	GenericAnchorSet,
} from "../../../feature-libraries";
import { makeAnonChange, tagChange, TaggedChange, Delta, FieldKey } from "../../../core";
import { brand, JsonCompatibleReadOnly } from "../../../util";
import { noRepair } from "../../utils";
import { ValueChangeset, valueField, valueHandler } from "./utils";

const fieldA: FieldKey = brand("a");

const valueChange0To1: ValueChangeset = { old: 0, new: 1 };
const valueChange1To0: ValueChangeset = { old: 1, new: 0 };
const valueChange1To2: ValueChangeset = { old: 1, new: 2 };
const valueChange2To1: ValueChangeset = { old: 2, new: 1 };
const valueChange0To2: ValueChangeset = { old: 0, new: 2 };

const changeHandler = genericFieldKind.changeHandler;

function nodeChangeFromValueChange(valueChange: ValueChangeset): NodeChangeset {
	return {
		fieldChanges: new Map([
			[
				fieldA,
				{
					fieldKind: valueField.identifier,
					shallow: brand(valueChange),
				},
			],
		]),
	};
}

function valueChangeFromNodeChange(nodeChange: NodeChangeset): ValueChangeset {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return nodeChange.fieldChanges!.get(fieldA)!.shallow as unknown as ValueChangeset;
}

const nodeChange0To1: NodeChangeset = nodeChangeFromValueChange(valueChange0To1);
const nodeChange1To0: NodeChangeset = nodeChangeFromValueChange(valueChange1To0);
const nodeChange1To2: NodeChangeset = nodeChangeFromValueChange(valueChange1To2);
const nodeChange2To1: NodeChangeset = nodeChangeFromValueChange(valueChange2To1);
const nodeChange0To2: NodeChangeset = nodeChangeFromValueChange(valueChange0To2);

const unexpectedDelegate = () => assert.fail("Unexpected call");

const idAllocator: IdAllocator = unexpectedDelegate;

const childComposer = (nodeChanges: TaggedChange<NodeChangeset>[]): NodeChangeset => {
	const valueChanges = nodeChanges.map((c) =>
		tagChange(valueChangeFromNodeChange(c.change), c.revision),
	);
	const valueChange = valueHandler.rebaser.compose(valueChanges, idAllocator);
	return nodeChangeFromValueChange(valueChange);
};

const childInverter = (nodeChange: NodeChangeset): NodeChangeset => {
	const valueChange = valueChangeFromNodeChange(nodeChange);
	const inverse = valueHandler.rebaser.invert(makeAnonChange(valueChange), idAllocator);
	return nodeChangeFromValueChange(inverse);
};

const childRebaser = (nodeChangeA: NodeChangeset, nodeChangeB: NodeChangeset): NodeChangeset => {
	const valueChangeA = valueChangeFromNodeChange(nodeChangeA);
	const valueChangeB = valueChangeFromNodeChange(nodeChangeB);
	const rebased = valueHandler.rebaser.rebase(
		valueChangeA,
		makeAnonChange(valueChangeB),
		idAllocator,
	);
	return nodeChangeFromValueChange(rebased);
};

const childToDelta = (nodeChange: NodeChangeset): Delta.NodeChanges => {
	const valueChange = valueChangeFromNodeChange(nodeChange);
	assert(typeof valueChange !== "number");
	return {
		setValue: valueChange.new,
	};
};

const dataEncoder = (data: string) => ({ s: data });
// eslint-disable-next-line @typescript-eslint/no-unsafe-return
const dataDecoder = (data: JsonCompatibleReadOnly) => (data as any).s;

const taggedChange = makeAnonChange<0>(0);

describe("Generic FieldKind", () => {
	describe("compose", () => {
		it("empty list", () => {
			const actual = changeHandler.rebaser.compose([], idAllocator);
			assert.deepEqual(actual, 0);
		});

		it("populated list", () => {
			const actual = changeHandler.rebaser.compose([taggedChange, taggedChange], idAllocator);
			assert.deepEqual(actual, 0);
		});
	});

	describe("rebase", () => {
		const actual = changeHandler.rebaser.rebase(0, taggedChange, idAllocator);
		assert.deepEqual(actual, 0);
	});

	it("invert", () => {
		const actual = changeHandler.rebaser.invert(taggedChange, idAllocator);
		assert.deepEqual(actual, 0);
	});

	it("intoDelta", () => {
		const actual = changeHandler.intoDelta(0, noRepair);
		assert.deepEqual(actual, []);
	});

	const encodingShallowTestData: [string, GenericChangeset][] = [["Misc", 0]];
	const encodingNestedTestData: [string, GenericAnchorSet<string>][] = [
		["Empty", new GenericAnchorSet()],
		["key: 0", GenericAnchorSet.fromData([{ key: changeHandler.getKey(0), data: "0" }])],
		["key: 42", GenericAnchorSet.fromData([{ key: changeHandler.getKey(42), data: "42" }])],
		[
			"key: 0,1,42",
			GenericAnchorSet.fromData([
				{ key: changeHandler.getKey(0), data: "0" },
				{ key: changeHandler.getKey(1), data: "1" },
				{ key: changeHandler.getKey(42), data: "42" },
			]),
		],
	];

	describe("Encoding", () => {
		const encoder = changeHandler.encoder;
		const version = 0;
		for (const [name, data] of encodingShallowTestData) {
			describe(`shallow change: ${name}`, () => {
				it("roundtrip", () => {
					const encoded = encoder.encodeChangeForJson(version, data);
					const decoded = encoder.decodeChangeJson(version, encoded);
					assert.deepEqual(decoded, data);
				});
				it("Json roundtrip", () => {
					const encoded = JSON.stringify(encoder.encodeChangeForJson(version, data));
					const decoded = encoder.decodeChangeJson(version, JSON.parse(encoded));
					assert.deepEqual(decoded, data);
				});
			});
		}
		for (const [name, data] of encodingNestedTestData) {
			describe(`shallow change: ${name}`, () => {
				it("roundtrip", () => {
					const encoded = encoder.encodeAnchorSetForJson(version, data, dataEncoder);
					const decoded = encoder.decodeAnchorSetJson(version, encoded, dataDecoder);
					assert.deepEqual(decoded, data);
				});
				it("Json roundtrip", () => {
					const encoded = JSON.stringify(
						encoder.encodeAnchorSetForJson(version, data, dataEncoder),
					);
					const decoded = encoder.decodeAnchorSetJson(
						version,
						JSON.parse(encoded),
						dataDecoder,
					);
					assert.deepEqual(decoded, data);
				});
			});
		}
	});
});
