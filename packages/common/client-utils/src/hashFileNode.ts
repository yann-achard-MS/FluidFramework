/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sha1, sha256 } from "sha.js";

// Note: See 'Isomorphic Code' section in the package README.md
import type { IsoBuffer } from "./bufferNode.js";

/**
 * Hash a file. Consistent within a session, but should not be persisted and
 * is not consistent with git.
 * If called under an insecure context for a browser, this will fallback to
 * using the node implementation.
 *
 * @param file - The contents of the file in a buffer.
 * @param algorithm - The hash algorithm to use, artificially constrained by what is used internally.
 * @param hashEncoding - The encoding of the returned hash, also artificially constrained.
 * @returns The hash of the content of the buffer.
 *
 * @internal
 */
export async function hashFile(
	file: IsoBuffer,
	algorithm: "SHA-1" | "SHA-256" = "SHA-1",
	hashEncoding: "hex" | "base64" = "hex",
): Promise<string> {
	let engine;
	// eslint-disable-next-line default-case
	switch (algorithm) {
		case "SHA-1": {
			engine = new sha1();
			break;
		}
		case "SHA-256": {
			engine = new sha256();
			break;
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
	return engine.update(file).digest(hashEncoding) as string;
}

/**
 * Create a github hash (Github hashes the string with blob and size)
 * Must be called under secure context for browsers
 *
 * @param file - The contents of the file in a buffer
 * @returns The sha1 hash of the content of the buffer with the `blob` prefix and size
 *
 * @internal
 */
export async function gitHashFile(file: IsoBuffer): Promise<string> {
	const size = file.byteLength;
	// eslint-disable-next-line unicorn/prefer-code-point
	const filePrefix = `blob ${size.toString()}${String.fromCharCode(0)}`;
	const engine = new sha1();
	return engine.update(filePrefix).update(file).digest("hex");
}
