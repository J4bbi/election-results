
let margin = {
    top: 15,
    right: 100,
    bottom: 15,
    left: 150
};

let width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

let svg = d3.select("#container").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


let parties = {
        "Grn": { abbr: "Grn", color: "#00B140", name: "Scottish Green Party"},
    "SNP": { abbr: "SNP", color: "#FDF38E", name: "Scottish National Party"},
    "SLD": { abbr: "SLD", color: "#FAA61A", name: "Scottish Liberal Democrats"},
    "Lab": { abbr: "Lab", color: "#e4003b", name: "Scottish Labour"},
    "Con": { abbr: "Con", color: "#00AEEF", name: "Scottish Conservatives"},
    // Conservative secondary color chosen over darken primary color: #0A3B7C
}

function getBackgroundColor(party) {
    if(party in parties)
        return parties[party].color
    else
        return "gray"
}

class Candidate {
    constructor(number, name, party, successful) {
        this.number = number;
        this.name = name;
        this.party = party;
        this.successful = successful;
        this.preference = [0];

    }
}

class Ward {
    constructor(filename) {
        this.filename = filename;
        this.name = undefined;
        this.seats = undefined;
        this.candidates = [];
        this.no_candidates = undefined;
        this.electorate = undefined;
        this.no_data_lines = undefined;
        this.electorate = undefined;
        this.votes_cast = undefined;
        this.rejected_votes = undefined;
        this.quota = undefined;
        this.data = undefined;
        this.canvas = {};
        this.stage = 1;

        this.load_file(filename);

        //this.draw_first_stage();
    }

    load_file(filename) {
        d3.text(filename).then(data => {
            let i;

            // Splitting input by newline
            let newline_data = data.split(/\r?\n/);

            // First 2 lines contain header info
            let header = newline_data.slice(0, 2);
            this.name = header[0];
            let temp = header[1].split(" ");
            this.no_candidates = +temp[1];
            this.seats = +temp[0];
            this.no_data_lines = +temp[2];
            this.electorate = +temp[3];
            this.votes_cast = +temp[4];
            this.rejected_votes = +temp[5];
            this.valid_votes = this.votes_cast - this.rejected_votes;

            this.quota = Math.floor(this.valid_votes / (this.seats + 1)) + 1;

            // Lines 3-? contain candidate info
            let candidateIndex = newline_data.slice(2).findIndex((elem) => !isNaN(parseInt(elem[0]))) + 2;

            for(i = 2; i < candidateIndex; i++) {
                let candidate_data = newline_data[i].split(",");
                this.candidates.push(new Candidate(this.candidates.length + 1,
                    candidate_data[0], candidate_data[1], candidate_data[2] === "1"))

            }

            let voting_patterns = newline_data.slice(candidateIndex, (candidateIndex + this.no_data_lines));
            voting_patterns.unshift(['votes', 'one', 'two', 'three', 'four', 'five'])

            // Parsing the data makes it an array of array of ints
            this.data = d3.dsvFormat(" ").parseRows(voting_patterns.join("\n"), d3.autoType);

            // Calculating number of valid votes
            /*let valid_votes = this.data.slice(1).reduce(function(a, b) {
                if(a instanceof Array)
                    return a[0] + b[0]
                else
                    return a + b[0];
            });*/

            // First preference round
            for(i = 1; i < this.data.length; i++) {
                this.candidates[this.data[i][1] - 1].preference[0] += this.data[i][0];
            }

            let successful_candidates = []
            // Check who's elected after first preference
            this.candidates.forEach((c) => (c.preference[0] >= this.quota) ? successful_candidates.push(c.number): void(0))

            this.prepare_canvas();

            if(successful_candidates.length < this.seats)   {
                this.stage = 2;
                d3.select("#button").text("Stage 2");
                d3.select("#button").on("click", () => this.next_stage())
                d3.select("#button").style("display", "block");
            }
            else {
                d3.select("#info").text("All " + this.seats + " seats filled in first stage.");
            }



        });

    }

    prepare_canvas() {
        let data = this.candidates.map(((c) => ({ "name": c.name,
            "party": c.party,
            "percentage": Math.floor((c.preference[0]/this.valid_votes) * 1000) / 10,
            "value": c.preference[0]})))

        this.canvas.g = svg.append("g")
            .attr("transform", "translate(0,10)")
            .attr("class", "header");

        this.canvas.g.append("text")
            .attr("id", "header")
            .text(this.name + ", stage: " + this.stage);

        this.canvas.x = d3.scaleLinear()
            .range([0, width])
            .domain([0, d3.max(data, (d) => d.value)]);

        // Subtracting 60 off height to accommodate info text above and below
        this.canvas.y = d3.scaleBand()
            .domain(data.map((d) => d.name))
            .rangeRound([height - 60, 0])
            .padding(.1);

        //make y axis to show bar names
        this.canvas.yAxis = d3.axisLeft()
            .scale(this.canvas.y)
            .tickSize(0);

        this.canvas.gy = svg.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(0,30)")
            .call(this.canvas.yAxis);

        this.canvas.bars = svg.selectAll(".bar")
            .data(data)
            .enter()
            .append("g")

        //append rects
        this.canvas.bars.append("rect")
            .attr("class", "bar")
            .attr("y", (d) => this.canvas.y(d.name) + 30 )
            .attr("height", this.canvas.y.bandwidth())
            .attr("fill", (d) => getBackgroundColor(d.party))
            .attr("x", 0)
            .attr("width", 0)
            .transition()
            .duration(700)
            .ease(d3.easeExpOut)
            .attr("width", (d) => this.canvas.x(d.value));

        //add a value label to the right of each bar
        this.canvas.bars.append("text")
            .attr("class", "label")
            //y position of the label is halfway down the bar
            .attr("y", (d) => this.canvas.y(d.name) + this.canvas.y.bandwidth() / 2 + 34)
            //x position is 3 pixels to the right of the bar
            .attr("x", (d) => this.canvas.x(d.value) + 3)
            .text((d) => d.value + " (" + d.percentage + "%)");

        this.canvas.quota = svg.append('g')
            .attr("class", "quota")

        this.canvas.quota.append("line")
            .attr("x1", this.canvas.x(this.quota))
            .attr("y1", 0)
            .attr("x2", this.canvas.x(this.quota))
            .attr("y2", height)
            .attr("stroke-dasharray", 5,5);

        this.canvas.quota.append("text")
            .attr("x", this.canvas.x(this.quota) - 96)
            .attr("y", height - 10)
            .text("Quota: " + this.quota);

        this.canvas.quota.style("opacity", 0)
            .transition()
            .duration(2000)
            .ease(d3.easeLinear)
            .style("opacity", 1);

    }

    /*

    The possibilities for the next stage(s) are two:
    - that there is a surplus, which is then used or barring that,
    - the candidate with the fewest votes is eliminated and his votes split amongst the hopefuls

     */

    next_stage() {
        d3.select("#header").text(this.name + ", stage: " + this.stage);
        console.log(this.stage);

    }
}


ward = new Ward("Torry-Ferryhill.dat")
//ward = new Ward("Southside-Newington-2017.dat")
console.log(ward);

