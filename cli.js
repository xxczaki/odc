#!/usr/bin/env node

const {exec} = require('child_process');
const async = require('async');
const boxen = require('boxen');
const chalk = require('chalk');
const ora = require('ora');

const spinner = ora();

const packageJSONPath = `${process.cwd()}/package.json`;
const packageJSON = require(packageJSONPath);
const deps = packageJSON.dependencies || {};
const devDeps = packageJSON.devDependencies || {};

const dependencies = Object
	.keys(deps)
	.map(dep => {
		return update(dep, '--save');
	});

const devDependencies = Object
	.keys(devDeps)
	.map(dep => {
		return update(dep, '--save-dev');
	});

const run = [].concat(dependencies, devDependencies);

function update(dep, flag) {
	return done => {
		spinner.start(`Updating ${dep}`);
		exec(`npm i ${dep}@latest ${flag}`, err => {
			if (err) {
				spinner.fail(`Error updating ${dep}:\n`);
				return done(err);
			}

			spinner.succeed(`Successfully updated ${dep}!`);
			done(null);
		});
	};
}

async.series(run, err => {
	if (err) {
		console.log(err);
		process.exit(1);
	}
	console.log(boxen(`${chalk.green('Everything up-to-date!')}`, {borderStyle: 'round', borderColor: 'green'}));
	process.exit(0);
});
