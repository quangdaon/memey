#!/usr/bin/env node

const savedMemes = require('./data/memes.json');
const expressions = require('./data/expressions.json');
const path = require('path');
const npmPkg = require('./package.json');
const clipboardy = require('clipboardy');
const request = require('request-promise-native');
const fs = require('fs');
const open = require('open');
const prompt = require('prompt');
const download = require('image-downloader');

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
	.alias('a', 'alternating-case')
	.nargs('a', 1)
	.describe('a', 'Automatically transform text to AlTeRnAtInG cAsE')
	.alias('o', 'open')
	.nargs('o', 1)
	.describe('o', 'Open image in browser immediately after creation')
	.alias('l', 'open-locally')
	.nargs('l', 1)
	.describe('l', 'Download and open image locally immediately after creation')
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
			debug('Meme Found Expanded:', data.id);
			if (args.a) {
				return handleAlternatingCase(data.id, top, bottom);
			}
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
				debug('Meme Found Shorthand:', exp.id);
				if (args.a) {
					return handleAlternatingCase(data.id, top, bottom);
				}
				return createMeme(exp.id, matched[1], matched[2]);
			}
		}
		console.log('Meme not found.');
	}
}

async function handleAlternatingCase(id, top, bottom) {
	var topAlt = '';
	var bottomAlt = '';
	if (top) {
		topAlt = alternatingCase(args.t);
	}
	if (bottom) {
		bottomAlt = alternatingCase(args.b);
	}
	return createAdvancedMeme(id, topAlt, bottomAlt) // need to use advanced 'boxes' API because text0 and text1 are always capitalized 
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

	handleResponse(response);
}

async function createAdvancedMeme(id, top, bottom) {
	debug('Creating Advanced Meme...');
	let API_URL = 'https://api.imgflip.com/caption_image';
	const data = {
		template_id: id,
		username: config.IMGFLIP_USERNAME,
		password: config.IMGFLIP_PASSWORD,
		boxes: [
			{
				"text": top
			},
			{
				"text": bottom
			}
		]
	};
	const options = {
		uri: API_URL,
		method: 'POST',
		form: data
	};

	const response = JSON.parse(await request(options));

	handleResponse(response);
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

async function handleResponse(response) {
	if (response.success) {
		debug('Response Got!');
		const imgUrl = response.data.url;
		console.log(imgUrl);

		const options = {
			url: imgUrl,
			dest: './images'
		}

		await clipboardy.write(imgUrl);

		if (args.o) await open(imgUrl);

		if (args.l) {
			try {
				const { filename, image } = await download.image(options);
				console.log(filename);
				open(filename);
			} catch (e) {
				console.log(e);
			}
		}

	} else {
		console.log('Conversion Failed:', response.error_message);
	}

	process.exit(0);
}

function alternatingCase(s) {
	var chars = s.toLowerCase().split("");
	for (var i = 0; i < chars.length; i += 2) {
		chars[i] = chars[i].toUpperCase();
	}
	return chars.join("");
};

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
