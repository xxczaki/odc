'use strict';

export const detectRange = version => {
	const firstChar = version.charAt(0);
	const secondChar = version.charAt(1);

	if (/[<>]/i.test(firstChar)) {
		if (secondChar === '=') {
			return version.slice(0, 2);
		}

		return firstChar;
	}

	if (/[=~^]/i.test(firstChar)) {
		return firstChar;
	}

	return undefined;
};
