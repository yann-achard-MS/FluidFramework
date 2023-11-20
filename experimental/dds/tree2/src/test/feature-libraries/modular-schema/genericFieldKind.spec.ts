/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { GenericChangeset, genericFieldKind } from "../../../feature-libraries";
import { EncodingTestData, makeEncodingTestSuite } from "../../utils";
import { IJsonCodec } from "../../../codec";

const unexpectedDelegate = () => assert.fail("Unexpected call");

describe("Generic FieldKind", () => {
	describe("Encoding", () => {
		const encodingTestData: EncodingTestData<GenericChangeset, unknown> = {
			successes: [["Misc", 0]],
		};

		const throwCodec: IJsonCodec<any> = {
			encode: unexpectedDelegate,
			decode: unexpectedDelegate,
		};
		makeEncodingTestSuite(
			genericFieldKind.changeHandler.codecsFactory(throwCodec),
			encodingTestData,
		);
	});
});
