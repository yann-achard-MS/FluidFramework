/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// import {
// 	Sequenced as S,
// 	Rebased as R,
// 	Offset,
// 	SeqNumber,
// } from "../format";
import { squash } from "../squash";
import {
	originals,
} from "./samples";

describe(squash.name, () => {
	it("single", () => {
		for (const original of originals) {
			const actual = squash([original]);
			assert.deepEqual(actual, original.frames[0]);
		}
	});
});
