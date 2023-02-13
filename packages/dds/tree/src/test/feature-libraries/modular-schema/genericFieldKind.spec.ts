/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	EmptyChangeset,
	genericFieldKind,
	IdAllocator,
	SequenceFieldAnchorSet,
	anchorSetFromData,
} from "../../../feature-libraries";
import { makeAnonChange } from "../../../core";
import { JsonCompatible, JsonCompatibleReadOnly } from "../../../util";
import { noRepair } from "../../utils";
import { TestChange } from "../../testChange";

const changeHandler = genericFieldKind.changeHandler;
const anchorSetOps = changeHandler.anchorSetOps;

const unexpectedDelegate = () => assert.fail("Unexpected call");

const idAllocator: IdAllocator = unexpectedDelegate;

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

	const encodingShallowTestData: [string, EmptyChangeset][] = [["Misc", 0]];
	const encodingNestedTestData: [string, SequenceFieldAnchorSet<TestChange>][] = [
		["Empty", anchorSetOps.factory()],
		[
			"key: 0",
			anchorSetFromData(anchorSetOps, [
				{ key: changeHandler.getKey(0), data: TestChange.mint([], 0) },
			]),
		],
		[
			"key: 42",
			anchorSetFromData(anchorSetOps, [
				{ key: changeHandler.getKey(42), data: TestChange.mint([], 42) },
			]),
		],
		[
			"key: 0,1,42",
			anchorSetFromData(anchorSetOps, [
				{ key: changeHandler.getKey(0), data: TestChange.mint([], 0) },
				{ key: changeHandler.getKey(1), data: TestChange.mint([], 1) },
				{ key: changeHandler.getKey(42), data: TestChange.mint([], 42) },
			]),
		],
	];

	const dataEncoder = (testChange: TestChange): JsonCompatible =>
		TestChange.encoder.encodeForJson(0, testChange);

	const dataDecoder = (testChange: JsonCompatibleReadOnly): TestChange =>
		TestChange.encoder.decodeJson(0, testChange);

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
					const encoded = anchorSetOps.encode(version, data, dataEncoder);
					const decoded = anchorSetOps.decode(version, encoded, dataDecoder);
					assert.deepEqual(decoded, data);
				});
				it("Json roundtrip", () => {
					const encoded = JSON.stringify(anchorSetOps.encode(version, data, dataEncoder));
					const decoded = anchorSetOps.decode(version, JSON.parse(encoded), dataDecoder);
					assert.deepEqual(decoded, data);
				});
			});
		}
	});
});
