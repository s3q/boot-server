
function removeDuplicate(string, deplecated) {
	const set = string.split(deplecated)
	return set.join('')
  }

  console.log(removeDuplicate("dkolksjfloeooeprfd", "o"))