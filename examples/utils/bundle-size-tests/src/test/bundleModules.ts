/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

interface WebpackModule {
	readonly name?: string;
	readonly chunks?: readonly (number | string)[];
	readonly modules?: readonly WebpackModule[];
}

export interface WebpackStats {
	readonly entrypoints: Readonly<
		Record<string, { readonly chunks?: readonly (number | string)[] }>
	>;
	readonly modules: readonly WebpackModule[];
}

export function getEntrypointModules(
	stats: WebpackStats,
	entrypoint: string,
): readonly string[] {
	const entrypointChunks = new Set(stats.entrypoints[entrypoint]?.chunks);
	assert(entrypointChunks.size > 0, `Missing webpack chunks for ${entrypoint}`);

	const modules: string[] = [];
	const visit = (
		module: WebpackModule,
		inheritedChunks: readonly (number | string)[] = [],
	): void => {
		const chunks =
			module.chunks !== undefined && module.chunks.length > 0
				? module.chunks
				: inheritedChunks;
		if (module.name !== undefined && chunks.some((chunk) => entrypointChunks.has(chunk))) {
			modules.push(module.name.replaceAll("\\", "/"));
		}
		for (const child of module.modules ?? []) {
			visit(child, chunks);
		}
	};

	for (const module of stats.modules) {
		visit(module);
	}
	return modules;
}

export function assertIncludesModule(modules: readonly string[], modulePath: string): void {
	assert(
		modules.some((module) => module.endsWith(modulePath)),
		`Expected bundle to include ${modulePath}`,
	);
}

export function assertExcludesModule(modules: readonly string[], modulePath: string): void {
	assert(
		modules.every((module) => !module.endsWith(modulePath)),
		`Expected bundle to exclude ${modulePath}`,
	);
}

export function assertUsesEmittedTreeArtifacts(modules: readonly string[]): void {
	assert(
		modules.some((module) => module.includes("/packages/dds/tree/lib/")),
		"Expected bundle to include the emitted @fluidframework/tree package",
	);
	assert(
		modules.every((module) => !module.includes("/packages/dds/tree/src/")),
		"Expected bundle to exclude @fluidframework/tree source files",
	);
}
