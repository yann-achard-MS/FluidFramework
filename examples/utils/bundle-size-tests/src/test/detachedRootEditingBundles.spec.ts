/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";

import {
	assertExcludesModule,
	assertIncludesModule,
	assertUsesEmittedTreeArtifacts,
	getEntrypointModules,
	type WebpackStats,
} from "./bundleModules.js";

describe("SharedTree detached-root editing provider bundles", () => {
	const codecModules = [
		"/packages/dds/tree/lib/feature-libraries/modular-schema/modularChangeCodecV3.js",
		"/packages/dds/tree/lib/feature-libraries/optional-field/optionalFieldCodecV3.js",
	];
	const entrypoints = [
		["sharedTreeDefault", false],
		...["sharedTree", "fluidFramework"].flatMap((prefix) =>
			["Omitted", "Disabled", "Enabled", "Unused"].map(
				(configuration) =>
					[
						`${prefix}DetachedRootEditing${configuration}`,
						configuration === "Enabled",
					] as const,
			),
		),
	] as const;

	for (const [entrypoint, enabled] of entrypoints) {
		it(`${entrypoint} ${enabled ? "includes" : "excludes"} experimental codecs`, () => {
			// Read after webpack has emitted the production probes, not during test discovery.
			const stats = JSON.parse(
				readFileSync("./build/forest-provider-probes/stats.json", "utf-8"),
			) as WebpackStats;
			const modules = getEntrypointModules(stats, entrypoint);
			assertUsesEmittedTreeArtifacts(modules);
			if (entrypoint.startsWith("fluidFramework")) {
				assert(
					modules.every(
						(module) => !module.includes("/packages/framework/fluid-framework/src/"),
					),
					"Expected bundle to exclude fluid-framework source files",
				);
			}
			for (const codecModule of codecModules) {
				if (enabled) {
					assertIncludesModule(modules, codecModule);
				} else {
					assertExcludesModule(modules, codecModule);
				}
			}
		});

		if (enabled) {
			it(`${entrypoint} retains a usable configured factory`, () => {
				const source = readFileSync(
					`./build/forest-provider-probes/${entrypoint}.js`,
					"utf-8",
				);
				// Scope webpack's library variable locally so probes cannot affect each other.
				const exports = runInThisContext(`(() => { ${source}\n; return bundle; })()`) as {
					readonly SharedTree: { getFactory(): { readonly type: string } };
				};
				assert.equal(typeof exports.SharedTree.getFactory, "function");
				assert.equal(
					exports.SharedTree.getFactory().type,
					"https://graph.microsoft.com/types/tree",
				);
			});
		}
	}
});
