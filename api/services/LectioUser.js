var cheerio = require('cheerio');
var request = require('request');
var regex = require('named-regexp').named;

module.exports = {
	construct_url : function ( user_id, school_id ) {
		return "https://www.lectio.dk/lectio/" + school_id + "/SkemaNy.aspx?type=elev&elevid=" + user_id
	},

	get : function ( user_id, school_id ) {
		var url = this.construct_url(user_id, school_id);
		request({
			"url": url
		}, function ( error, response, body ) {
			if ( ! error && response.statusCode == 200 ) {
				this.parse_data(body, user_id, school_id);
			} else {
				console.log("User Import Error");
				// Error...
			}
		});
	},

	parse_data : function (body, user_id, school_id) {
		$ = cheerio.load(body);

		// If this table doesn't exist, an error occured while recieving data
		if ( $("#s_m_Content_Content_SkemaNyMedNavigation_skema_skematabel").length < 1 ) {
			console.log(" Wrong data! ");

			return false;
		}

		var user_regex = regex(/(:<user_type>.*) (:<name>.*), (:<class>.*) - (:<type>.*)/ig);
		var user = user_regex($("#s_m_HeaderContent_MainTitle").text().trim());

		console.log(user);

		Lectio_sections.update(
			{
				"user_id" : user_id,
				"school_id" : school_id
			}, {
				"name" : user.capture("name"),
				"user_type" : user.capture("user_type")
			}
		).exec();
	}
}