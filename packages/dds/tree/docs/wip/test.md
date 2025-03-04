<style>
:root {
	/* space toggles */
	--on: initial;
	--off: /*!*/;

	--bg1: rgb(35, 35, 40);
	--bg2: rgb(55, 55, 55);

	/* initialize toggles */
	--_1: var(--on);
	--_2: var(--off);
}

.delta {
	font-family: 'consolas';
	padding: 0 0px;
	margin: 0px;
	color: white;
	display: flex;
}

.delta ul {
	list-style-type: none;
	padding-right: 10px;
}

.delta ul: {
}

.delta li > * {
	/* rotate toggles */
	--_1: var(--2);
	--_2: var(--1);
}

.delta li {
	/* promote toggles */
	--1: var(--_1);
	--2: var(--_2);
	--bgIn: var(--1,var(--bg1)) var(--2, var(--bg2));
	--bgOut: var(--1,var(--bg2)) var(--2, var(--bg1));

	background: var(--bgIn);
	padding: 0.1em 0.2em;
	margin-left: -2em;
	border: 2px solid var(--bgOut);
}
.delta {
	display: block;
}
.noop::before, .attach::before, .detach::before, .replace::before {
	border-radius: 1em;
	border: solid .1em #999;
	margin: .5em;
	padding: .3em;
	font-size: .8em;
}
.noop::before {
	content: "no-op";
	background: gray;
}
.attach::before {
	content: "attach";
	background: #070;
}
.detach::before {
	content: "detach";
	background: #811;
}
.replace::before {
	content: "replace";
	background: #048;
}

</style>
<div class="delta">
	<div><span>New Trees:</span>
	</div>
	<div><span>Roots:</span>
		<ul>
			<li><span>Beverages</span>
			<ul>
				<li>[00] → [00]<span class="noop">(x5)</span></li>
				<li>[__] → [05]<span class="attach">(x2)</span></li>
				<li>[05] → [__]<span class="detach">(x1)</span></li>
				<li>[06] → [07]<span class="replace">(x1)</span></li>
				<li><span>Tea</span>
				<ul>
					<li>Black Tea</li>
					<li>
						<span>Green Tea</span>
						<ul>
							<li>Pi Lo Chun</li>
						</ul>
					</li>
				</ul>
				</li>
			</ul>
		</li>
		</ul>
	</div>
</div>
