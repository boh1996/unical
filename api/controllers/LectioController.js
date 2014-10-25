/**
 * LectioController
 *
 * @description :: Server-side logic for managing lectios
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {
	timetable: function (req, res) {
		// [ branch: '517', section: 'asdasd', year: '2014' ]
		//return res.json();
		return res.send("Test");
	},

	colect: function (req, res) {
		// [ branch: '517', section: 'asdasd', year: '2014', week: '42' ]

		return res.send("Collection");
	}
};

