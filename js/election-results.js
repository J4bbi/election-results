
const margin = {
    top: 15,
    right: 100,
    bottom: 15,
    left: 150
};

const width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

const svg = d3.select("#container").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


const parties = {
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

function toFixedFive(number) {
    return +number.toFixed(5);
}

function removeElement(array, element) {
    const index = array.indexOf(element);
    if (index > -1) {
        array.splice(index, 1);
    }

    return array
}

class Candidate {
    constructor(number, name, party, successful) {
        this.number = number;
        this.name = name;
        this.party = party;
        this.successful = successful; // Not computed but passed from inputted data
        this.votes = [0]; // Votes that get added to with each stage
        this.preference = 1; // Which preference of candidate's voters is being counted
        // This only comes into consideration if this candidate has been eliminated
        this.eliminated = false;

    }

    get total_votes() {
        return this.votes.reduce((a, b) => a + b)
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
        this.canvas = { };
        this.stage = 1;
        this.stage_candidate = undefined;

        this.load_file(filename);

    }

    is_next_stage_needed() {
        return this.candidates.filter((c) => c.total_votes >= this.quota).length !== this.seats
    }

    get_data() {
        let candidates = JSON.parse(JSON.stringify(this.candidates.filter((c) => !c.eliminated)));

        // This loop iterates over each candidate's votes and appends negative values
        // to the earlier value and removes the negative element
        for(let i = 0; i < candidates.length; i++) {
            const negative = candidates[i].votes.findIndex((v) => v < 0);

            if(negative > 0) {
                candidates[i].votes = [this.quota];
            }

        }

        let cs = candidates.map(((c) => ({
            "number": c.number,
            "name": c.name,
            "party": c.party,
            "total_votes": c.votes.reduce((a, b) => a + b),
            "percentage": Math.floor((c.votes.reduce((a, b) => a + b)/this.valid_votes) * 1000) / 10,
            "stages": c.votes.map((v, i, a) => ({"cumulative_votes": (i) ? a.slice(0, i).reduce((w,y) => w + y) : v, "votes": v, "candidate": c.number}))
        })));

        cs.sort((a, b) => a.total_votes - b.total_votes);

        return cs
    }

    get_candidate(number) {
        for(let i = 0; i < this.candidates.length; i++) {
            if(this.candidates[i].number === number)
                return this.candidates[i]
        }
    }

    get_non_transferable_votes(candidate) {
        return this.data.filter((v) => v[1] === candidate.number && v.length === 2)
            .reduce((previousValue, currentValue) => previousValue + currentValue[0], 0);

    }

    set_y_axis(data) {
        this.canvas.y = d3.scaleBand()
            .domain(data.map((d) => d.name))
            .rangeRound([height - 80, 0])
            .padding(.1);

        // Function to create Y axis legend
        // make Y axis to show bar names
        this.canvas.yAxis = d3.axisLeft()
            .scale(this.canvas.y)
            .tickSize(0);

        this.canvas.gy.transition(this.canvas.transition).call(this.canvas.yAxis);
    }

    set_labels(data) {
        // Is it okay to re-apply data?
        svg.selectAll(".label")
            .data(data)
            .join()
            .attr("x", (d) => this.canvas.x(d.total_votes) + 3)
            .attr("y", (d) => this.canvas.y(d.name) + this.canvas.y.bandwidth() / 2 + 34)
            .text((d) => Math.floor(d.total_votes) + " (" + d.percentage + "%)");
    }

    /*
        Function that loads the data file containing voting preferences.
    */

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

            // The data contains an extra 0 at the end of each voting patterns to indicate
            // end of data. Remap the data removing the last two characters to get rid of that.
            let voting_patterns = newline_data.slice(candidateIndex - 1, (candidateIndex + this.no_data_lines))
                .map((v) => v.substring(0, v.length - 2));

            // Parsing the data makes it an array of array of ints
            this.data = d3.dsvFormat(" ").parseRows(voting_patterns.join("\n"), d3.autoType);

            // First preference round
            for(i = 1; i < this.data.length; i++) {
                this.candidates[this.data[i][1] - 1].votes[0] += this.data[i][0];
            }

            this.prepare_canvas();

            if(this.is_next_stage_needed())   {
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

    /*
        Function that draws the initial title, information section, y axis, bar chart and quota line.
    */

    prepare_canvas() {
        this.canvas.transition =

        this.canvas.g = svg.append("g")
            .attr("transform", "translate(0,10)")
            .attr("class", "header");

        this.canvas.gy = svg.append("g")
            .attr("class", "y axis")
            .attr("transform", "translate(0, 40)");

        this.canvas.g.append("text")
            .attr("id", "header")
            .text(this.name + ", stage: " + this.stage);

        this.canvas.g.append("text")
            .attr("class", "general_info")
            .attr("transform", "translate(0,15)")
            .text("Seats: " + this.seats +
                " | Electorate: " + this.electorate +
                " | Turnout: " + Math.floor((this.votes_cast / this.electorate) * 1000) / 10 + "%");

        this.canvas.g.append("text")
            .attr("id", "subheader")
            .attr("transform", "translate(0,30)")

        this.draw_canvas();

    }

    /*
        Function that draws the dotted quota line
    */

    draw_quota() {
        this.canvas.quota = svg.append('g')
            .attr("class", "quota")

        this.canvas.quota.append("line")
            .attr("x1", this.canvas.x(this.quota))
            .attr("y1", 0)
            .attr("x2", this.canvas.x(this.quota))
            .attr("y2", height)
            .attr("stroke-dasharray", 5,5);

        this.canvas.quota.append("text")
            .attr("x", this.canvas.x(this.quota) - 146)
            .attr("y", height - 10)
            .text("Quota: " + this.quota + " (" + Math.floor((this.quota/this.valid_votes) * 1000) / 10 + "%)");

        this.canvas.quota.style("opacity", 0)
            .transition()
            .duration(2000)
            .ease(d3.easeLinear)
            .style("opacity", 1);

    }

    /*
        Function that initialises the canvas (svg)
    */

    draw_canvas() {
        // Candidates sorted in ascending order by total votes
        // last element is candidate with most votes, first element with fewest
        this.candidates.sort((a, b) => a.total_votes - b.total_votes);

        const data = this.get_data();

        // Scale function for X axis
        this.canvas.x = d3.scaleLinear()
            .range([0, width])
            .domain([0, d3.max(data, (d) => d.total_votes)]);

        this.set_y_axis(data);

        this.canvas.bars = svg.append("g").attr("id", "bars").attr("transform", "translate(0, 10)");

        let enter = this.canvas.bars
            .selectAll("g")
            .data(data, (d) => d.number)
            .join("g")
            .attr("id", (d) => "candidate-" + d.number);

        enter.selectAll("rect")
            .data(d => d.stages, (d, i) => d.candidate + "_" + i)
            .join("rect")
            .attr("class", "bar")
            .attr("y", (d) => this.canvas.y(this.get_candidate(d.candidate).name) + 30 )
            .attr("height", this.canvas.y.bandwidth())
            .attr("fill", (d) => getBackgroundColor(this.get_candidate(d.candidate).party))
            .attr("x", 0)
            .attr("width", 0)
            .call(enter => enter
                .transition(this.canvas.transition)
                .attr("width", (d) => this.canvas.x(this.get_candidate(d.candidate).total_votes)))
            .append("title")
            .text((d) => this.get_candidate(d.candidate).total_votes + " first preference votes");

        enter.append("text")
            .attr("class", "label")
            .attr("id", (d) => "label-" + d.number)
            //y position of the label is halfway down the bar
            .attr("y", (d) => this.canvas.y(d.name) + this.canvas.y.bandwidth() / 2 + 34)
            //x position is 3 pixels to the right of the bar
            .attr("x", (d) => this.canvas.x(d.total_votes) + 3)
            .text((d) => d.total_votes + " (" + d.percentage + "%)");

        this.draw_quota();
    }

    /*
        The possibilities for the next stage(s) are two:
        - that there is a surplus, which is then used or barring that,
        - the candidate with the fewest votes is eliminated and his votes split amongst the hopefuls
    */

    next_stage() {
        d3.select("#header").text(this.name + ", stage: " + this.stage);

        let cs = this.candidates.filter((c) => !c.eliminated);
        cs.sort((a, b) => a.total_votes - b.total_votes);

        if(cs[cs.length -1].total_votes > this.quota) {
            this.transfer_votes(cs[cs.length - 1]);

        }
        else {
            this.eliminate_candidate(cs[0].number);

        }

        if(this.is_next_stage_needed())   {
            this.stage += 1;
            d3.select("#button").text("Stage " + this.stage);
        }
        else {
            d3.select("#button").style("display", "none");
            d3.select("#info").text("All " + this.seats + " seats filled in stage " + this.stage + ".");
        }

    }

    transfer_votes(candidate) {
        this.stage_candidate = candidate.number;
        let surplus_votes = candidate.total_votes - this.quota;
        let weight = toFixedFive(surplus_votes /
            (candidate.total_votes - this.get_non_transferable_votes(candidate)));

        // Giving all candidates placeholder values for new stage
        this.candidates.filter((c) => c.eliminated || c.total_votes < this.quota)
            .forEach((c) => c.votes[this.stage-1] = 0)

        candidate.votes[this.stage - 1] = -surplus_votes;

        // Only data where that candidate was first preference and there was more than the single preference
        let stage_data = this.data
            .filter((v) => v[1] === candidate.number && v.length > 2);

        const cs = this.candidates
            .filter((c) => !c.eliminated && c.total_votes >= this.quota)
            .map((c) => c.number);

        // Remove from data any references to eliminated or already successful candidates
        for(let i = 0; i < stage_data.length; i++) {
            let row = stage_data[i].slice(1);
            cs.forEach((cs) => stage_data[i] = [stage_data[i][0]].concat(removeElement(row, cs)));

        }

        // These are non-transferable votes being dumped, should be recorded
        // TODO

        stage_data = stage_data.filter((s) => s.length > 1);

        // x preference round
        for(let i = 0; i < stage_data.length; i++) {
            // Array element 3. will give second preference
            let c = stage_data[i].slice(1).shift();

            this.get_candidate(c).votes[this.stage - 1] += toFixedFive(stage_data[i][0] * weight);
            // Bloody javascript
            this.get_candidate(c).votes[this.stage - 1] = toFixedFive(this.get_candidate(c).votes[this.stage - 1]);
        }

        const data = this.get_data();

        this.set_y_axis(data);

        let enter = this.canvas.bars
            .selectAll("g")
            .data(data, (d) => d.number)
            .join("g")
            .attr("id", (d) => "candidate-" + d.number);

        enter.selectAll("rect")
            .data(d => d.stages, (d, i) => d.candidate + "_" + i)
            .join(enter =>
                    enter
                        .append("rect")
                        .attr("class", "bar new")
                        .style("opacity", .9)
                        .attr("y", (d) => this.canvas.y(this.get_candidate(d.candidate).name) + 30 )
                        .attr("height", this.canvas.y.bandwidth())
                        .attr("fill", (d) => getBackgroundColor(this.get_candidate(this.stage_candidate).party))
                        .attr("x", (d) => this.canvas.x(d.cumulative_votes))
                        .attr("width", 0)
                        .call((enter) => enter
                            .transition(this.canvas.transition).attr("width", (d) => this.canvas.x(d.votes)))
                        .append("title")
                        .text((d) => (Math.floor(d.votes) +
                            " votes from " + this.get_candidate(this.stage_candidate).name)),
                update => update
                    .attr("y", (d) => this.canvas.y(this.get_candidate(d.candidate).name) + 30 ),
                    //.attr("width", (d) => this.canvas.x(d.cumulative_votes)),
                exit => exit
                    .remove())

        this.set_labels(data);

        d3.select("#subheader")
            .text("Transferring " + surplus_votes + " surplus votes from " + candidate.name + ".");

    }

    eliminate_candidate(candidate_number) {
        let eliminated_candidate = this.get_candidate(candidate_number);
        eliminated_candidate.eliminated = true;
        this.stage_candidate = eliminated_candidate.number;

        let stage_data = this.data.filter((v) => v[1] === eliminated_candidate.number && v.length > 2);

        const cs = this.candidates
            .filter((c) => !c.eliminated && c.total_votes >= this.quota)
            .map((c) => c.number);

        // Remove from data any references to eliminated or already successful candidates
        for(let i = 0; i < stage_data.length; i++) {
            let row = stage_data[i].slice(1);
            cs.forEach((cs) => stage_data[i] = [stage_data[i][0]].concat(removeElement(row, cs)));

        }

        stage_data = stage_data.filter((s) => s.length > 2);

        // Giving all candidates placeholder values for new stage
        this.candidates.filter((c) => c.eliminated || c.total_votes < this.quota)
            .forEach((c) => c.votes[this.stage - 1] = 0)

        // x preference round,
        // data is formatted so
        // [1, 10, 8, 4, 5, 6, 2, 9, 1, 3, 7], where
        //
        for(let i = 0; i < stage_data.length; i++) {
            let c = stage_data[i].slice(2).shift();

            this.get_candidate(c).votes[this.stage - 1] += stage_data[i][0];

        }

        const data = this.get_data();

        this.set_y_axis(data);

        let enter = this.canvas.bars
            .selectAll("g")
            .data(data, (d) => d.number)
            .join("g")
            .attr("id", (d) => "candidate-" + d.number);

        enter.selectAll("rect")
            .data(d => d.stages, (d, i) => d.candidate + "_" + i)
            .join(enter =>
                    enter
                        .append("rect")
                        .attr("class", "bar")
                        .style("opacity", .9)
                        .attr("y", (d) => this.canvas.y(this.get_candidate(d.candidate).name) + 30 )
                        .attr("height", this.canvas.y.bandwidth())
                        .attr("fill", (d) => getBackgroundColor(this.get_candidate(this.stage_candidate).party))
                        .attr("x", (d) => this.canvas.x(d.cumulative_votes))
                        .attr("width", 0)
                        .call((enter) => enter
                            .transition(this.canvas.transition).attr("width", (d) => this.canvas.x(d.votes)))
                        .append("title")
                        .text((d) => (Math.floor(d.votes) +
                            " votes from " + this.get_candidate(this.stage_candidate).name)),
                update => update
                    .attr("y", (d) => this.canvas.y(this.get_candidate(d.candidate).name) + 30 )
                    .attr("height", this.canvas.y.bandwidth())
                    .attr("width", (d) => (this.canvas.x(d.votes) > 0) ? this.canvas.x(d.votes) : 0 ),
                exit => exit
                    .remove())

        this.set_labels(data);

        d3.select("#subheader")
            .text("Transferring " + Math.floor(eliminated_candidate.total_votes) +
                " votes from eliminated candidate " + eliminated_candidate.name + ".");

        if(this.candidates.filter((c) => !c.eliminated).length === this.seats) {
            d3.select("#button").style("display", "none");
            d3.select("#info").text("All " + this.seats + " seats filled in stage " + this.stage + ".");
        }
    }
}

//ward = new Ward("Hazlehead-Queens_Cross-Countesswells.dat")
//ward = new Ward("Torry-Ferryhill.dat")
//ward = new Ward("Southside-Newington.dat")
ward = new Ward("data/Bridge_of_Don.dat")
console.log(ward);

