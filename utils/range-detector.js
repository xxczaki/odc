'use strict';

const detectRange = version => {
	const firstChar = version.charAt(0);
	const secondChar = version.charAt(1);

	if (firstChar.match(/[<>]/i)) {
		if (secondChar === '=') {
			return version.slice(0, 2);
		}

		return firstChar;
	}

	if (firstChar.match(/[=~^]/i)) {
		return firstChar;
	}

	return '';
};

module.exports = {detectRange};
