// latis url format
// http://lasp.colorado.edu/lisird/tss/sorce_tsi_24hr.json?time,tsi_1au&time%3E=2010-01-01&time%3C2011-01-01

$(document).ready(function(){

	// Set up date input
	$('input[name="date-range"]').daterangepicker({
		// Defining a couple of ranges for quick use
		ranges: {
			'Previous Six Months': [
				moment().subtract(6, 'months').format('MM/DD/YYYY'),
				moment().format('MM/DD/YYYY')
			],
			'Previous Year': [
				moment().subtract(1, 'year').format('MM/DD/YYYY'),
				moment().format('MM/DD/YYYY')
			],
		}
	}, function(start, end){
		if ( end.diff(start, 'days') < 7 ) {
			alert("Please choose a range of at least 7 days.");
		} else {
			getData(start, end);
		}
	});

	function getData(start, end) {
		// start and end are returned as Moment objects
		var startDate = start.format('YYYY-MM-DD'),
			endDate = end.format('YYYY-MM-DD'),
			baseURL = "http://lasp.colorado.edu/lisird/tss/sorce_tsi_24hr.json?time,tsi_1au&",
			endpoint = baseURL + 'time>=' + startDate + '&time<=' + endDate;

		$.getJSON(endpoint, function(data){
			processData(data);
		});
	} 

	function processData(data) {
		console.log(data);
		
		// Generate the series for the line with a simple pluck
		var lineSeries = _.map(_.pluck(data, 'tsi_1au'), function(num){
			if ( num !== 0 ) { return num; } else { return null; }
		});

		// Generate week categories for aggregates
		var numberOfWeeks = Math.floor(data.length/7);
		var weeks = _.range(numberOfWeeks);

		// Group the data by week
		//
		// Just an intermediate step to make it a bit easier
		// to do further data conversion
		var weekSets = {};
		_.each(weeks, function(i){
			var startIndex = i*7, // the index of the first day in the week
				endIndex = i*7+7, // the index of the last day

				// Pluck the values of tsi_1au from the
				// array of objects in the range
				weekOfData = _.pluck(_.at(data, _.range(startIndex,endIndex)), 'tsi_1au'),
				startTime = data[startIndex]['time'];

			// Want to filter out zeros and replace with null
			var zerosReplaced = _.map(weekOfData, function(num){
				if ( num !== 0 ) { return num; } else { return null; }
			});
			weekSets[startTime] = {};
			weekSets[startTime] = zerosReplaced;
		});

		var weekAggregates = _.map(weekSets, function(week, startTime){
			return {
				start: startTime,
				mean: getMean(week),
				stdev: getStDev(week),
				sterr: getStErr(week)
			};
		});

		// Create the highcharts-ready data series
		var barSeries = [],
			errorSeries = [];

		_.each(weekAggregates, function(week){
			// Need a bit of extra code to catch nulls
			if ( week.mean !== null ) {
				barSeries.push({
					y: week.mean,
					stdev: week.stdev,
					sterr: week.sterr,
					startTime: week.start
				});
			} else { barSeries.push(null); }

			if ( week.sterr !== 0 ) {
				errorSeries.push([week.mean-week.sterr, week.mean+week.sterr]);
			} else { errorSeries.push(null) }
		});

		console.log("lineSeries", lineSeries);
		console.log("barSeries", barSeries);
		console.log("errorSeries", errorSeries);

		$('.viz-container').highcharts({
	        title: { text: '' },
	        tooltip: {
            	formatter: function() {
            		// Catching an error so it fails silently when user
            		// mouses over the line (the line shouldn't display anything
            		// but for some reason it's still trying to render a tooltip)
            		try {
            			return '<b>Period Start</b>: ' + this.point.startTime + '<br />'
	            			+ '<b>Average TSI</b>: ' + this.point.y.toFixed(4) + '<br />'
			            	+ '<b>StDev</b>: ' + this.point.stdev.toFixed(4) + '<br />'
			            	+ '<b>StErr</b>: ' + this.point.sterr.toFixed(4);
            		} catch(e) {}  
		    	}   
            },
            credits: { enabled: false },
	        xAxis: [{
	            categories: _.pluck(data, 'time'),
	            lineWidth: 0,
				minorGridLineWidth: 0,
				lineColor: 'transparent',
				labels: {
					enabled: false
				},
				minorTickLength: 0,
				tickLength: 0
	        },{
	        	categories: weeks,
	        	title: {
	        		text: 'Week in Range'
	        	}
	        }],
	        yAxis: [{
	            title: {
	                text: 'TSI (W/m^2)'
	            },
	            // need to catch this going below 0
	            min: Math.min.apply(null, lineSeries) - 1 > 0 ?
	            	Math.min.apply(null, lineSeries) - 1 
	            	: 0 ,
	            max: Math.max.apply(null, lineSeries) + 1,
	            //tickInterval: 0.5
	        }],
	        series: [{
	            name: 'Daily TSI Measurements',
	            type: 'spline',
	            data: lineSeries,
	            xAxis: 0,
	            color: "#dddddd",
	            //zIndex: 999
	        },{
	        	name: 'Weekly Average TSI',
	        	type: 'column',
	        	data: barSeries,
	        	xAxis: 1
	        },{
	        	name: 'Weekly Average TSI Error',
	        	type: 'errorbar',
	        	data: errorSeries,
	        	xAxis: 1
	        }]
	    });

	}

});

// Some math helpers with simple tests to verify accuracy

function sum(arr) {
	// helper to sum
	return _.reduce(arr, function(sum, num){
		return sum + num;
	});
}
console.log( "sum([1,2,3]) should be 6", sum([1,2,3]) === 6 );

function getMean(arr) {
	// return the mean of a set of numbers
	// if there's no data just break and return null

	// _.compact just removes falsy values
	if ( _.compact(arr).length == 0 ) {
		return null;
	} else {
		return sum(arr) / arr.length;
	}
}
console.log( "mean([13,22,16]) should be 17",
	getMean([13,22,16]) === 17 );

function getStDev(arr) {
	// if there's no data just break and return null
	if ( _.compact(arr).length == 0 ) {
		return null;
	} else {
		// Calculate the mean
		var mean = getMean(arr);

		// calculate the distance from the mean for each item and square it
		var squaredDiffs = _.map(arr, function(num){
			return (mean - num) * (mean - num);
		});

		// divide the sum of squares by n-1 to get the mean of squares
		var meanOfSquares = sum(squaredDiffs) / (arr.length - 1);

		// return the sqare root of the previous step
		return Math.sqrt(meanOfSquares);
	}		
}
console.log( "getStDev([13,22,16]) should be about 4.5826",
	getStDev([13,22,16]).toFixed(4) == 4.5826 );

function getStErr(arr) {
	if ( _.compact(arr).length == 0 ) {
		return null;
	} else {
		return getStDev(arr) / Math.sqrt(arr.length)
	}
}
console.log( "getStErr([13,22,16]) should be about 2.64575",
	getStErr([13,22,16]).toFixed(5) == 2.64575);
