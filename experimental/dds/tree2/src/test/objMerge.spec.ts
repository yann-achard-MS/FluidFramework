/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { merge, mergeToStrings } from "./objMerge";

describe("merge", () => {
	describe("objects", () => {
		it("same object", () => {
			const obj = { a: 1, b: 2 };
			assert.deepStrictEqual(merge(obj, obj), obj);
		});
		it("same data", () => {
			const objLhs = { a: 1, b: 2 };
			const objRhs = { a: 1, b: 2 };
			assert.deepStrictEqual(merge(objLhs, objRhs), objLhs);
		});
		it("different data", () => {
			const f2 = () => 2;
			const objLhs: unknown = { a: 1, b: 2, c: 3, f1: () => 1, f2 };
			const objRhs: unknown = { a: 1, b: 3, d: 4, f1: () => 1, f2 };
			const merged = merge(objLhs, objRhs);
			const s = Symbol("func");
			throw new assert.AssertionError({
				message: `arguments are not deep-equal:\n${mergeToStrings(merged).join("\n")}`,
			});
			//  assert.deepStrictEqual(merge(objLhs, objRhs), objLhs);
		});
	});
});
