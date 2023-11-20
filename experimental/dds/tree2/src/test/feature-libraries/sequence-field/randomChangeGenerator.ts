/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { unreachableCase } from "@fluidframework/core-utils";
import { cursorForJsonableTreeNode, SequenceField as SF } from "../../../feature-libraries";
import { leaf } from "../../../domains";
import { brand } from "../../../util";

enum Operation {
	Delete = 1,
	Insert = 2,
}

/**
 * @param seed - Random seed used to generate the change.
 * @param maxIndex - Maximum child index for the generated change.
 * @returns Randomly generated change.
 */
export function generateRandomChange(seed: number, maxIndex: number): SF.Changeset {
	const random = makeRandom(seed);
	const builder = SF.sequenceFieldEditor;
	const operation = random.integer(Operation.Delete, Operation.Insert) as Operation;
	switch (operation) {
		case Operation.Insert:
			return builder.insert(
				random.integer(0, maxIndex),
				[
					cursorForJsonableTreeNode({
						type: leaf.number.name,
						value: random.integer(0, Number.MAX_SAFE_INTEGER),
					}),
				],
				brand(0),
			);
		case Operation.Delete:
			return builder.delete(random.integer(0, maxIndex), random.integer(1, 10), brand(0));
		default:
			unreachableCase(operation);
	}
}
