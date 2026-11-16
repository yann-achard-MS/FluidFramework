/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileSync } from "node:fs";

import {
	assertExcludesModule,
	assertIncludesModule,
	assertUsesEmittedTreeArtifacts,
	getEntrypointModules,
	type WebpackStats,
} from "./bundleModules.js";

describe("SharedTree forest provider bundles", () => {
	it("isolates forest providers", () => {
		// This test must be run after webpack.
		const stats = JSON.parse(
			readFileSync("./build/forest-provider-probes/stats.json", "utf-8"),
		) as WebpackStats;
		const referenceProvider = "/packages/dds/tree/lib/shared-tree/forestTypeReference.js";
		const optimizedProvider = "/packages/dds/tree/lib/shared-tree/forestTypeOptimized.js";
		const debugProvider = "/packages/dds/tree/lib/shared-tree/forestTypeExpensiveDebug.js";
		const objectForest =
			"/packages/dds/tree/lib/feature-libraries/object-forest/objectForest.js";
		const chunkedForest =
			"/packages/dds/tree/lib/feature-libraries/chunked-forest/chunkedForest.js";
		const comparisonForest =
			"/packages/dds/tree/lib/feature-libraries/comparison-forest/comparisonForest.js";

		const defaultModules = getEntrypointModules(stats, "sharedTreeDefault");
		assertUsesEmittedTreeArtifacts(defaultModules);
		assertIncludesModule(defaultModules, referenceProvider);
		assertExcludesModule(defaultModules, optimizedProvider);
		assertExcludesModule(defaultModules, debugProvider);
		assertIncludesModule(defaultModules, objectForest);
		assertExcludesModule(defaultModules, chunkedForest);
		assertExcludesModule(defaultModules, comparisonForest);

		const referenceModules = getEntrypointModules(stats, "sharedTreeReferenceForest");
		assertUsesEmittedTreeArtifacts(referenceModules);
		assertIncludesModule(referenceModules, referenceProvider);
		assertExcludesModule(referenceModules, optimizedProvider);
		assertExcludesModule(referenceModules, debugProvider);
		assertIncludesModule(referenceModules, objectForest);
		assertExcludesModule(referenceModules, chunkedForest);
		assertExcludesModule(referenceModules, comparisonForest);

		const optimizedModules = getEntrypointModules(stats, "sharedTreeOptimizedForest");
		assertUsesEmittedTreeArtifacts(optimizedModules);
		assertIncludesModule(optimizedModules, referenceProvider);
		assertIncludesModule(optimizedModules, optimizedProvider);
		assertExcludesModule(optimizedModules, debugProvider);
		// ObjectForest remains reachable because existing APIs use it as the default when no
		// forest is provided. Removing that default requires a separate API change.
		assertIncludesModule(optimizedModules, objectForest);
		assertIncludesModule(optimizedModules, chunkedForest);
		assertExcludesModule(optimizedModules, comparisonForest);

		const debugModules = getEntrypointModules(stats, "sharedTreeExpensiveDebugForest");
		assertUsesEmittedTreeArtifacts(debugModules);
		assertIncludesModule(debugModules, referenceProvider);
		assertExcludesModule(debugModules, optimizedProvider);
		assertIncludesModule(debugModules, debugProvider);
		assertIncludesModule(debugModules, objectForest);
		assertIncludesModule(debugModules, chunkedForest);
		assertIncludesModule(debugModules, comparisonForest);
	});
});
