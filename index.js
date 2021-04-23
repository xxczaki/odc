#!/usr/bin/env node

'use strict';

import {promises as fs} from 'fs';
import {performance} from 'perf_hooks';
import getopts from 'getopts';
import kleur from 'kleur';
import findUp from 'find-up';
import rpj from 'read-package-json-fast';
import latestVersion from 'latest-version';
import pMap from 'p-map';
import {createStore} from 'storage-async';
import logUpdate from 'log-update';

import {detectRange} from './utils/range-detector.js';
import {tmpdir} from 'os';

const options = getopts(process.argv.slice(2), {
	alias: {
		help: 'h',
		version: 'v',
		input: 'i',
		exclude: 'e',
		json: 'j'
	}
});
const temporary = new Map();

if (options.help) {
	console.log(`
	Usage:
	  $ odc <options>
	Options:
	  -i, --input <path>                 Path of a package.json file (defaults to the nearest one)
	  -e, --exclude <pkg,...>            Exclude packages
	  -j, --json		    	     Output a JSON object, instead of writing package.json
      -nc, --no-cache                    Run without using cache
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

	const cache = await createStore({path: `${tmpdir()}/odc.json`, ttl: 900_000});

	try {
		const closest = await findUp(options.input || 'package.json');

		if (!closest) {
			console.log(kleur.red(`Unable to find package.json in ${process.cwd()} or any of its parent directories`));
			process.exit(1);
		}

		const parsed = await rpj(closest);

		const deps = parsed.dependencies || {};
		const devDeps = parsed.devDependencies || {};
		const previousDeps = {...deps};
		const previousDevDeps = {...devDeps};

		let updatedDeps = {};
		let updatedDevDeps = {};

		const mapper = async name => {
			const previous = previousDeps[name];
			const cached = await cache.get(name);

			const latest = cached ? cached : `${detectRange(previous) ?? ''}${await latestVersion(name)}`;

			if (previous !== latest && !/(?<range>latest|\*)/s.test(previous)) {
				updatedDeps = {...updatedDeps, ...{[name]: latest}};

				if (!cached) {
					temporary.set(name, latest);
				}

				console.log(`${name} ${kleur.red(previous)} → ${kleur.green(latest)}`);
			}
		};

		const devMapper = async name => {
			const previous = previousDevDeps[name];
			const cached = await cache.get(name);

			const latest = cached ? cached : `${detectRange(previous) ?? ''}${await latestVersion(name)}`;

			if (previous !== latest && !/(?<range>latest|\*)/s.test(previous)) {
				updatedDevDeps = {...updatedDevDeps, ...{[name]: latest}};

				if (!cached) {
					temporary.set(name, latest);
				}

				console.log(`${name} ${kleur.red(previous)} → ${kleur.green(latest)}`);
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

			console.log(kleur.green('Everything up-to-date'));
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

		if (temporary.size > 0) {
			let n = 1;

			for await (const [key, value] of temporary.entries()) {
				await cache.set(key, value);
				logUpdate(kleur.yellow(`Populating cache (${n++}/${temporary.size})`));
			}
		}
	} catch (error) {
		console.log(error);
		process.exit(1);
	}
})();

