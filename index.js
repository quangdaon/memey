#!/usr/bin/env node

const savedMemes = require('./data/memes.json');
const expressions = require('./data/expressions.json');
const path = require('path');
const npmPkg = require('./package.json');

const clipboardy = require('clipboardy');
const request = require('request-promise-native');
const fs = require('fs');
const opn = require('opn');
const prompt = require('prompt');

const args = require('yargs')
	.usage('Usage: $0 [<command>] [options]')
	.command('create', '(Optional/default) creates a meme.', () => null, parseInput)
	.command('update', 'Updates meme list', () => null, () => update().then(res => console.log(res ? 'Updated!' : 'Already up-to-date.')))
	.command('login', 'Login to ImgFlip', () => null, login)
	.command('stats', 'Show meme stats', () => null, getStats)
	.alias('s', 'search')
	.nargs('s', 1)
	.describe('s', 'Selects a meme')
	.alias('t', 'top')
	.nargs('t', 1)
	.describe('t', 'Input top text')
	.alias('b', 'bottom')
	.nargs('b', 1)
	.describe('b', 'Input bottom text')
	.help('h')
	.alias('h', 'help')
	.alias('v', 'version')
	.describe('v', 'Show version number')
	.count('debug')
	.alias('d', 'debug')
	.example('$0 "y u no work"', 'Creates y u no meme')
	.epilog('Created by Quangdao Nguyen')
	.argv;

const debug = args.debug === 1 ? console.log : () => null;

debug('Debugging enabled...');

let config;

try {
	config = require('./data/config.json');
	debug('Config Found...');
} catch (e) {
	config = require('./data/sample.config.json');
	debug('Config Not Found...');
}

const { s: query, t: top, b: bottom } = args;
if (['create', 'update', 'login', 'stats'].indexOf(args._[0]) === -1) {
	if (args.v) {
		showVersion();
	} else {
		parseInput();
	}
}

function parseInput() {
	debug('Parsing Input...');
	if (!config.IMGFLIP_USERNAME) return console.log('You need to log in first. Run "meme login" and provide your memeflip credentials.');
	let inputValid = false;

	for (let a in args) {
		if (args.hasOwnProperty(a) && a !== '$0' && args[a] && args[a].length) {
			inputValid = true;
			break;
		}
	}

	if (!inputValid) return console.log('An input is required.');

	if (query) {
		debug('Expanded Input Format');
		const codify = str => str.toLowerCase().replace(/[^\w]+/gi, '-');
		const matchesQuery = meme => codify(meme.name).indexOf(codify(query)) > -1;

		if (!top && !bottom) {
			const matches = savedMemes
				.filter(matchesQuery)
				.map(meme => `${meme.name} - ${meme.url}`);

			matches.forEach(e => console.log(e));

			return;
		}

		const data = savedMemes.find(matchesQuery);

		if (data) {
			debug('Meme Found:', data.id);
			return createMeme(data.id, top, bottom);
		} else {
			console.log('No memes found.');
		}

	} else {
		debug('Shorthand Input Format');
		for (let i = 0; i < expressions.length; i++) {
			const exp = expressions[i];
			const regex = new RegExp(exp.regex, 'i');

			const matched = args._[0] && args._[0].match(regex);

			if (matched) {
				debug('Meme Found:', exp.id);
				return createMeme(exp.id, matched[1], matched[2]);
			}
		}
		console.log('Meme not found.');
	}
}

async function createMeme(id, top, bottom) {
	debug('Creating Meme...');
	let API_URL = 'https://api.imgflip.com/caption_image';
	const data = {
		template_id: id,
		username: config.IMGFLIP_USERNAME,
		password: config.IMGFLIP_PASSWORD,
		text0: top,
		text1: bottom
	};
	const options = {
		uri: API_URL,
		method: 'POST',
		form: data
	};

	const response = JSON.parse(await request(options));

	if (response.success) {
		debug('Response Got!');
		const imgUrl = response.data.url;
		console.log(imgUrl);

		await clipboardy.write(imgUrl);

		if (args.o) await opn(imgUrl);

	} else {
		console.log('Conversion Failed:', response.error_message);
	}

	process.exit(0);
}

async function update() {
	const apiRes = await request('https://api.imgflip.com/get_memes');
	const { memes } = JSON.parse(apiRes).data;
	let added = false;

	memes.forEach(meme => {
		if (!savedMemes.find(m => m.id === meme.id)) {
			console.log('Added:', meme.name);
			savedMemes.push(meme);
			added = true;
		}
	});

	fs.writeFileSync(path.join(__dirname, './data/memes.json'), JSON.stringify(savedMemes.sort((a, b) => a.id - b.id), null, 4), 'UTF-8');
	return added;
}

function getStats() {
	console.log('Saved Memes:', savedMemes.length);
	console.log('Known Expressions:', expressions.length);
}

function showVersion() {
	console.log(`Memey Version ${npmPkg.version}`);
}

function login() {
	prompt.start();

	prompt.get([{
		name: 'username',
		required: true
	}, {
		name: 'password',
		hidden: true
	}], function (err, results) {
		const data = {
			IMGFLIP_USERNAME: results.username,
			IMGFLIP_PASSWORD: results.password
		};

		fs.writeFileSync(path.join(__dirname, './data/config.json'), JSON.stringify(data, null, 4), 'UTF-8');
	});
}

