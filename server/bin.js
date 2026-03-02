let app = require('./')

let port = process.env.PORT || 5001

app.listen(port, () => {
	console.log('listening on http://localhost:' + port)
})