/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BTree } from "@tylerbu/sorted-btree-es6";
import { brand, type Brand } from "./brand.js";

export type TupleBTree<K, V> = Brand<BTree<K, V>, "TupleBTree">;

export function newTupleBTree<K extends readonly unknown[], V>(
	entries?: [K, V][],
): TupleBTree<K, V> {
	return brand(new BTree<K, V>(entries, compareTuples));
}

function compareTuples(arrayA: readonly unknown[], arrayB: readonly unknown[]): number {
	for (let i = 0; i < arrayA.length; i++) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const a = arrayA[i] as any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const b = arrayB[i] as any;

		// Less-than and greater-than always return false if either value is undefined,
		// so we handle undefined separately, treating it as less than all other values.
		if (a === undefined && b !== undefined) {
			return -1;
		} else if (b === undefined && a !== undefined) {
			return 1;
		} else if (a < b) {
			return -1;
		} else if (a > b) {
			return 1;
		}
	}

	return 0;
}
