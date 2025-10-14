/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	FieldKinds,
	type Required,
	type Optional,
	type Sequence,
	type Identifier,
	type Forbidden,
	fieldKinds,
	fieldKindConfigurations,
	getCodecTreeForModularChangeFormat,
	type ModularChangeFormatVersion,
} from "./defaultFieldKinds.js";

export {
	type DefaultChangeset,
	type DetachedRootIds,
	type DetachedRootIdRange,
	DefaultChangeFamily,
	type IdBasedChangeFamilyDataEditor,
	DefaultIdBasedDataEditor,
	type DataEditor,
	type RequiredFieldEditor,
	type OptionalFieldEditor,
	type SequenceFieldEditor,
	intoDelta,
	relevantRemovedRoots,
} from "./defaultEditBuilder.js";

export {
	type DetachedRootLocation,
	type DetachedRootsLocation,
	type Locator,
	LocationBasedDataEditor,
	type ILocationBasedDataEditor,
} from "./locationBasedEditBuilder.js";

export {
	SchemaValidationError,
	isNodeInSchema,
	isFieldInSchema,
	throwOutOfSchema,
} from "./schemaChecker.js";

export { defaultSchemaPolicy } from "./defaultSchema.js";

export { MappedEditBuilder } from "./mappedEditBuilder.js";
