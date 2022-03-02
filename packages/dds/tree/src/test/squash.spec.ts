/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Squashed as Sq,
	Sequenced as S,
	Rebased as R,
	SeqNumber,
	ClientId,
} from "../format";
import { SeqMetadata, squash } from "../squash";
import {
	ScenarioF,
	ScenarioG,
} from "./samples";

function testSquash(
	changes: (Sq.ChangeFrame | S.Transaction)[],
	clients: (ClientId | undefined)[],
): R.ChangeFrame {
	const seqClients = new Map<SeqNumber, SeqMetadata>(
		clients.map((client, index) => [index + 1, { client, ref: 0 }]),
	);
	Object.freeze(changes);
	return squash(changes, seqClients);
}

describe(squash.name, () => {
	// it("single", () => {
	// 	for (const original of allOriginals) {
	// 		const actual = testSquash([original], []);
	// 		assert.deepEqual(actual, original.frames[0]);
	// 	}
	// });

	it.only("Scenario F", () => {
		const actual = testSquash(
			[ScenarioF.e2neg, ScenarioF.e1, ScenarioF.e2posp],
			[1, 2],
		);
		assert.deepEqual(actual, ScenarioF.e3d);
	});

	describe("Scenario G", () => {
		const clients = [1, 2, 2, 2, 2];
		it("Delta for e3", () => {
			const actual = testSquash(
				[ScenarioG.e2neg, ScenarioG.e1, ScenarioG.e2posp],
				clients,
			);
			assert.deepEqual(actual, ScenarioG.e3d);
		});
		it("Delta for e4 (no reuse)", () => {
			const actual = testSquash(
				[
					ScenarioG.e3neg,
					ScenarioG.e2neg,
					ScenarioG.e1,
					ScenarioG.e2posp,
					ScenarioG.e3posp,
				],
				clients,
			);
			assert.deepEqual(actual, ScenarioG.e4d);
		});
		it("Delta for e4 (reuse e3d)", () => {
			const actual = testSquash(
				[ScenarioG.e3neg, ScenarioG.e3d, ScenarioG.e3posp],
				clients,
			);
			assert.deepEqual(actual, ScenarioG.e4d);
		});
		it("Delta for e5 (no reuse)", () => {
			const actual = testSquash(
				[
					ScenarioG.e4inv,
					ScenarioG.e3neg,
					ScenarioG.e2neg,
					ScenarioG.e1,
					ScenarioG.e2posp,
					ScenarioG.e3posp,
					ScenarioG.e4p,
				],
				clients,
			);
			assert.deepEqual(actual, ScenarioG.e5d);
		});
		it("Delta for e5 (reuse e4d)", () => {
			const actual = testSquash(
				[ScenarioG.e4inv, ScenarioG.e4d, ScenarioG.e4p],
				clients,
			);
			assert.deepEqual(actual, ScenarioG.e5d);
		});
	});
});
