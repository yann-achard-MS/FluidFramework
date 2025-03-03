# This is a Test

<style>
:root {
	/* space toggles */
	--on: initial;
	--off: /*!*/;

	--bg1: rgb(60, 60, 60);
	--bg2: rgb(100, 100, 100);

	/* initialize toggle cache */
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
	/* rotate cache */
	--_1: var(--2);
	--_2: var(--1);
}

.delta li {
/* promote cache */
	--1: var(--_1);
	--2: var(--_2);

	/* set values for each style */
	background: var(--1,var(--bg1)) var(--2, var(--bg2));
	padding: 0.1em 0.5em;
	margin-left: -2em;
}
.delta {
	background: var(--bg2);
}
</style>
<div class="delta">
  <ul>
	<li><span>Beverages</span>
	<ul>
		<li>Water</li>
		<li>Coffee</li>
		<li><span>Tea</span>
		<ul>
			<li>Black Tea</li>
			<li>
				<span>Green Tea</span>
				<ul>
					<li>Sencha</li>
					<li>Gyokuro</li>
					<li>Matcha</li>
					<li>Pi Lo Chun</li>
				</ul>
			</li>
		</ul>
		</li>
	</ul>
	</li>
  </ul>
</div>
