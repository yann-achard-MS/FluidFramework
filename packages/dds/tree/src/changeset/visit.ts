/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Because visitors are based on describing changes at some location in the tree (with the exception of "build"),
 * we want to ensure that visitors visit changes in an order that guarantees all changes are describable in terms
 * of some position in the tree. This means that we need to detach content bottom-up and attach content top-down.
 * Note that while the attach positions are expressed top-down, there is still a bottom-up spirit to building trees
 * that are being inserted.
 *
 * The second challenge, is that of the inability of the visitor to move-in content that has yet to be moved-out.
 * This leads to a two-pass algorithm, but there are two choices that can be made:
 * 1) Whether inserts should be performed in the first pass whenever possible (some are not: insert below a move-ins
 *   for which we have not yet seen the matching move-out).
 * Pros: The path above the insertion point is walked once instead of twice
 * Cons: The paths within the inserted content risk being walked twice instead of once (once for building the content,
 * once for traversing the tree to reach move-in marks in the second phase).
 *
 * 2) Whether move-ins for which we have the move-out content should be performed in the first pass.
 * Pros: The path above the move-in point is walked once instead of twice
 * Cons: We now have to record which of the move-ins we did not perform in the first pass. We build a trie of those to
 * reduce the amount of sifting we have to do on the second pass.
 *
 * The presence of a move table, which lists the src and dst paths for each move, could be leveraged to make some of
 * these option more efficient:
 * - If inserts are allowed in the first pass and move-ins are not allowed in the first pass, then the move table
 *   describes exactly which parts of the delta need applying in the second pass.
 * - If inserts and move-ins are allowed in the first pass then having a boolean flag for each entry in the move table
 *   that describes whether the move has been attached, or having a set for that describes which entries remain, would
 *   describe which parts of the delta  need applying in the second pass.
*/
