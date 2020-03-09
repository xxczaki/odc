#!/usr/bin/env node

'use strict';

const fs = require('fs').promises;
const {performance} = require('perf_hooks');
const getopts = require('getopts');
const chalk = require('chalk');
const findUp = require('find-up');
const rpj = require('read-package-json-fast');
const latestVersion = require('latest-version');
const pMap = require('p-map');

const {detectRange} = require('./utils/range-detector.js');

const options = getopts(process.argv.slice(2), {
	alias: {
		help: 'h',
		version: 'v',
		input: 'i',
		exclude: 'e',
		json: 'j'
	}
});

if (options.help) {
	console.log(`
	Usage: 
	  $ odc <options>
	Options:
	  -i, --input <path>                 Path of a package.json file (defaults to the nearest one)
	  -e, --exclude <pkg,...>            Exclude packages
	  -j, --json		    	     Output a JSON object, instead of writing package.json
	  -v, --version                      Print the version
	  -h, --help                         Print this help
	Examples:
	  $ odc
	  $ odc --input test/ -e chalk,lodash
  `);
	process.exit(0);
}

if (options.version) {
	console.log(require('./package.json').version);
	process.exit(0);
}

let exclude;
if (options.exclude && options.exclude !== true) {
	exclude = options.exclude.split(',');
}

(async () => {
	const t0 = performance.now();

	try {
		const closest = await findUp(options.input || 'package.json');

		if (!closest) {
			console.log(chalk.red(`Unable to find package.json in ${process.cwd()} or any of its parent directories`));
			process.exit(1);
		}

		const parsed = await rpj(closest);

		const deps = parsed.dependencies || {};
		const devDeps = parsed.devDependencies || {};
		const prevDeps = {...deps};
		const prevDevDeps = {...devDeps};

		let updatedDeps = {};
		let updatedDevDeps = {};

		const mapper = async name => {
			const previous = prevDeps[name];
			const operator = detectRange(previous);
			const latest = operator + await latestVersion(name);

			if (previous !== latest && !previous.match(/(?<range>latest|[*])/s)) {
				updatedDeps = {...updatedDeps, ...{[name]: latest}};
				console.log(`${name} ${chalk.red(previous)} → ${chalk.green(latest)}`);
			}
		};

		const devMapper = async name => {
			const previous = prevDevDeps[name];
			const operator = detectRange(previous);
			const latest = operator + await latestVersion(name);

			if (previous !== latest && !previous.match(/(?<range>latest|[*])/s)) {
				updatedDevDeps = {...updatedDevDeps, ...{[name]: latest}};
				console.log(`${name} ${chalk.red(previous)} → ${chalk.green(latest)}`);
			}
		};

		const names = Object.keys(deps)
			.filter(name => exclude ? !exclude.includes(name) : true);
		const devNames = Object.keys(devDeps)
			.filter(name => exclude ? !exclude.includes(name) : true);

		await Promise.all([names, devNames]).then(async results => {
			await pMap(results[0], mapper);
			await pMap(results[1], devMapper);
		});

		if (Object.keys(updatedDeps).length === 0 && Object.keys(updatedDevDeps).length === 0) {
			const t1 = performance.now();

			console.log(chalk.green('Everything up-to-date'));
			console.log(`\n✨  Done in ${((t1 - t0) / 1000).toFixed(2)}s`);
			process.exit(0);
		}

		// Remove unnecessary properties
		const {_id, ...rest} = parsed;

		const packageJson = {
			...rest,
			dependencies: {
				...rest.dependencies,
				...updatedDeps
			},
			devDependencies: {
				...rest.devDependencies,
				...updatedDevDeps
			}
		};

		if (options.json) {
			console.log('\n' + JSON.stringify(packageJson, undefined, 4));
		} else {
			await fs.writeFile(closest, JSON.stringify(packageJson, undefined, 4));
		}

		const t1 = performance.now();
		console.log(`\n✨  Done in ${((t1 - t0) / 1000).toFixed(2)}s`);
	} catch (error) {
		console.log(error);
		process.exit(1);
	}
})();

