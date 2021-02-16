const PokeFetch = {
    loadicon: document.querySelector(".header-logo svg"),
    requests: 0,
    /**
     * Fetches and returns a hydrated JSON object. Handles errors/400s and updates the loading icon appropriately.
     * @param {string} url - A path relative to the pokeapi endpoint.
     */
    async fetch(url) {
        if (this.requests === 0) this.loadicon.classList.add('loading');
        this.requests++;
        try {
            let result = await fetch("https://pokeapi.co/api/v2/"+url);
            if (result.ok) {
                result = await result.json();
                this.requests--;
                if (this.requests === 0) this.loadicon.classList.remove('loading');
                return result;
            } else {
                throw Error(result.status);
            }
        } catch (error) {
            console.error("PokeFetch Error:", error);
            this.loadicon.classList.remove('loading');
            this.loadicon.classList.add('error');
            setTimeout(() => this.loadicon.classList.remove('error'), 2000);
            return null;
        }
    }
}
class PokedexController {
    /**
     * Creates a controller for a pokedex.
     * @constructor
     * @param {HTMLElement} pokedexElement - Pokedex element containing all appropriate children.
     */
    constructor(pokedexElement) {
        this.pokedexElement = pokedexElement;
        this.lowerScreen = pokedexElement.querySelector(".greenscreen");
        this.upperScreen = pokedexElement.querySelector(".pokeinfo");
        this.currentPokemon = 1;
        this.pokemonList = [];

        //last dpad key pressed - for holding keys to scroll
        this.lastDpad = null;
        //cancellable timeout
        this.dpadLoopTimeout = null;

        pokedexElement.querySelector(".dpad").addEventListener("mousedown", this.dpadPress.bind(this));
        pokedexElement.querySelector(".dpad").addEventListener("mouseup", this.dpadRelease.bind(this));
        pokedexElement.querySelector(".dpad").addEventListener("mouseout", this.dpadRelease.bind(this));
        pokedexElement.querySelector(".dpad").addEventListener("touchstart", this.dpadPress.bind(this));
        pokedexElement.querySelector(".dpad").addEventListener("touchend", this.dpadRelease.bind(this));
        pokedexElement.querySelector(".select").addEventListener("mousedown", this.more.bind(this));
        pokedexElement.querySelector(".opt1").addEventListener("mousedown", this.jumpTo.bind(this));
        pokedexElement.querySelector(".opt2").addEventListener("mousedown", this.search.bind(this));

        //keybindings simulate mouse down and up events on element found by selector
        this.keyMap = [
            {selector:".dpad .up", codes:["KeyW", "ArrowUp"]},
            {selector:".dpad .left", codes:["KeyA", "ArrowLeft"]},
            {selector:".dpad .down", codes:["KeyS", "ArrowDown"]},
            {selector:".dpad .right", codes:["KeyD", "ArrowRight"]},
            {selector:".select", codes:["Digit1"]},
            {selector:".opt1", codes:["Digit2"]},
            {selector:".opt2", codes:["Digit3"]},

        ].reduce( (dict, mapping) => { //efficient conversion of the keyMap into code:element dictionary
            let el = pokedexElement.querySelector(mapping.selector);
            for (let code of mapping.codes) {
                dict[code] = el;
            }
            return dict;
        }, {});
        //hook keyboard events to functions that simulate respective mouse clicks
        document.addEventListener("keydown", this.keyDown.bind(this));
        document.addEventListener("keyup", this.keyUp.bind(this));
        this.cancelNextMouseEvent = false;

        this.showPokemon(this.currentPokemon);
        this.fetchPokemonList();
    }
    /**
     * Prepares to display a pokemon, fetching necessary info then displaying if still applicable.
     * @param {number} idno - ID of the pokemon.
     */
    async showPokemon(idno) {
        if (this.pokemonList[idno]  && this.pokemonList[idno].isFetched) {
            this.displayPokemon(this.pokemonList[idno]);
        } else {
            await this.fetchPokemon(idno);
            if (this.currentPokemon === idno) this.displayPokemon(this.pokemonList[idno]);
        }
    }
    /**
     * Fetches and caches the data for the provided pokemon.
     * @param {number} idno - ID of the pokemon.
     */
    async fetchPokemon(idno) {
        let result = await PokeFetch.fetch(`pokemon/${idno}`);
        result.isFetched = true;
        this.pokemonList[idno] = result;
    }
    /**
     * Displays a pokemon and itsinformation on the pokedex upper screen.
     * @param {object} pokemonObject - Object representing the pokemon from the pokeapi endpoint.
     */
    async displayPokemon(pokemonObject) {
        let sprite = pokemonObject.sprites.front_default;
        if (!sprite) sprite = "unknown.png";
        let img = document.createElement("img");
        img.src = sprite;
        //wait for the image to load so it doesn't flicker
        await new Promise((resolve) => img.onload = resolve);
        let imgbox = this.upperScreen.querySelector(".pokeimage");
        imgbox.innerHTML = "";
        imgbox.append(img);
        this.upperScreen.querySelector(".pokename").innerText = pokemonObject.name.replace(/-/g," ").toUpperCase();
        let typesbox = this.upperScreen.querySelector(".poketypes");
        typesbox.innerHTML = "";
        for (let typeobj of pokemonObject.types) {
            let typebadge = document.createElement("div");
            typebadge.classList.add('typebadge', typeobj.type.name);
            typebadge.innerText = this.titleCase(typeobj.type.name);
            typesbox.append(typebadge);
        }
        let statsbox = this.upperScreen.querySelector(".pokestats");
        statsbox.innerHTML = `
            <table>
                <tr><td>Height</td><td>${this.toFeet(pokemonObject.height)}</td></tr>
                <tr><td>Weight</td><td>${(pokemonObject.weight/4.536).toFixed(1)} lbs.</td></tr>
            </table>`
    }
    /**
     * Fetches a small chunk of pokemon, displays the few necessary for the start of the list, then fetches the rest of the list.
     */
    async fetchPokemonList() {
        const parseResults = (res) => {
            for (let pkmn of res.results) {
                pkmn.isFetched = false;
                pkmn.id = parseInt(pkmn.url.split("pokemon/")[1])
                this.pokemonList[pkmn.id] = pkmn;
            }
        }
        let initialList = await PokeFetch.fetch("pokemon");
        parseResults(initialList);
        //initial results should be enough to display.
        this.displayPokemonList();
        let nextParams = initialList.next.split("?")[1].split("&").reduce( (obj, param) => {
            let pair = param.split("=");
            obj[pair[0]] = pair[1];
            return obj;
        }, {});
        let remainingList = await PokeFetch.fetch(`pokemon?offset=${nextParams.offset}&limit=${initialList.count}`);
        parseResults(remainingList);
    }
    //updates the pokemon list to show where currentPokemon is
    /**
     * Updates the pokemon list on the lower screen to reflect the current pokemon.
     */
    displayPokemonList() {
        let idno = this.currentPokemon-1;
        this.lowerScreen.innerHTML = "";
        for (let i = 0; i < 5; i++) {
            let li = document.createElement("li");
            while (!this.pokemonList[idno] && idno < this.pokemonList.length) {
                idno++;
            }
            idno = this.limit(idno, 1, this.pokemonList.length-1);
            let pkmn = this.pokemonList[idno];
            if (pkmn) {
                li.innerHTML = `<span>${this.padZeroes(pkmn.id)}</span><span>${this.titleCase(pkmn.name)}</span>`;
                if (idno === this.currentPokemon) {
                    li.classList.add("selected");
                }
            }
            this.lowerScreen.append(li)
            idno++;
        }
    }
    /**
     * Event handler for initial press on dpad.
     * @param {Event} event 
     */
    dpadPress(event) {
        if (event instanceof TouchEvent) {
            this.cancelNextMouseEvent = true;
        } else if (event instanceof MouseEvent && this.cancelNextMouseEvent) {
            this.cancelNextMouseEvent = false;
            return;
        }
        let clicked = event.target.closest("button:not(.middle)");
        if (clicked) {
            clicked.classList.add("pressed");
            this.playSfx();
            switch (clicked.classList[0]) {
                case "up":
                    this.currentPokemon--;
                    while (!this.pokemonList[this.currentPokemon] && this.currentPokemon > 0) {
                        this.currentPokemon--;
                    }
                    break;
                case "left":
                    this.currentPokemon -= 4;
                    while (!this.pokemonList[this.currentPokemon] && this.currentPokemon > 0) {
                        this.currentPokemon--;
                    }
                    break;
                case "down":
                    this.currentPokemon++;
                    while (!this.pokemonList[this.currentPokemon] && this.currentPokemon < this.pokemonList.length) {
                        this.currentPokemon++;
                    }
                    break;
                case "right":
                    this.currentPokemon += 4;
                    while (!this.pokemonList[this.currentPokemon] && this.currentPokemon < this.pokemonList.length) {
                        this.currentPokemon++;
                    }
                    break;
            }
            this.currentPokemon = this.limit(this.currentPokemon, 1, this.pokemonList.length-1);
            this.displayPokemonList();
            if (!this.lastDpad) {
                this.showPokemon(this.currentPokemon);
                this.dpadLoopTimeout = setTimeout(this.dpadLoop.bind(this), 500);
            }
            this.lastDpad = clicked;
        }
    }
    /**
     * Repeats on a delay to press the dpad as long as it hasn't been released.
     */
    dpadLoop() {
        if (this.lastDpad) {
            this.dpadPress({ target:this.lastDpad });
            this.dpadLoopTimeout = setTimeout(this.dpadLoop.bind(this), 125);
        }
    }
    /**
     * Event handler for release of dpad.
     * @param {Event} event 
     */
    dpadRelease(event) {
        let clicked = event.target.closest("button:not(.middle)");
        if (clicked) clicked.classList.remove("pressed");
        if (this.lastDpad) {
            clearTimeout(this.dpadLoopTimeout);
            this.showPokemon(this.currentPokemon);
        }
        this.lastDpad = null;
    }
    /**
     * Prompt and jump to the given pokemon id.
     */
    jumpTo() {
        this.playSfx();
        let idno = parseInt(prompt("ID of pokemon: "));
        while (!this.pokemonList[idno]) {
            if (isNaN(idno)) return;
            idno = parseInt(prompt("Unknown ID. Try again: "));
        }
        this.currentPokemon = idno;
        this.displayPokemonList();
        this.showPokemon(idno);
    }
    /**
     * Prompt and jump to the given pokemon name.
     */
    search() {
        this.playSfx();
        let name = prompt("Name of pokemon: ");
        if (!name) return;
        name = name.toLowerCase().replace(/ /g, "-");
        let matches = this.pokemonList.filter(x => x.name === name);
        while (matches.length === 0) {
            name = prompt("Unknown name. Try again: ");
            if (!name) return;
            name = name.toLowerCase().replace(/ /g, "-");
            matches = this.pokemonList.filter(x => x.name === name);
        }
        let pkmn = matches[0];
        this.currentPokemon = pkmn.id;
        this.displayPokemonList();
        this.showPokemon(pkmn.id);
    }
    /**
     * Show more info on the pokemon. (UNIMPLEMENTED)
     */
    more() {
        this.playSfx();
        alert("Sorry, this feature isn't completed yet :(");
    }
    /**
     * Play a bleep sound effect.
     */
    playSfx() {
        let sfx = new Audio('menuclick.mp3');
        sfx.play()
        setTimeout(() => sfx.remove(), 600);
    }
    /**
     * Event handler for key down. Simulates mouse down on mapped button.
     * @param {Event} event 
     */
    keyDown(event) {
        if (!event.repeat) {
            let el = this.keyMap[event.code];
            if (el) {
                const evt = new MouseEvent('mousedown', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                  });
                el.dispatchEvent(evt);
            }
        }
    }
    /**
     * Event handler for key up. Simulates mouse up on mapped button.
     * @param {Event} event 
     */
    keyUp(event) {
        let el = this.keyMap[event.code];
        if (el) {
            const evt = new MouseEvent('mouseup', {
                view: window,
                bubbles: true,
                cancelable: true
              });
            el.dispatchEvent(evt);
        }
    }
    //formatting functions deemed too ugly to put inline
    /**
     * Pads the given number with zeroes to be 3 digits.
     * @param {number} id
     * @return {string} Number string with padding
     */
    padZeroes(id) {
        let str = String(id);
        while (str.length < 3) {
            str = "0"+str;
        }
        return str;
    }
    /**
     * Converts the given string to title case.
     * @param {string} str
     * @return {string} Title Case String
     */
    titleCase(str) {
        return str.split("-").map(x => x[0].toUpperCase() + x.substr(1).toLowerCase()).join(" ");
    }
    /**
     * Limits the given number to the given bounds, looping when crossed.
     * @param {number} num 
     * @param {numer} min 
     * @param {number} max 
     */
    limit(num, min, max) {
        if (num < min) return max;
        if (num > max) return min;
        return num;
    }
    /**
     * Converts pokemon height in decimeters to feet.
     * @param {number} decimeters 
     * @return {string} ft'in''
     */
    toFeet(decimeters) {
        let feetfloat = decimeters/3.048;
        let feet = Math.floor(feetfloat)
        return `${feet}'${Math.floor((feetfloat-feet)*12)}"`;
    }
}
let pokedex = new PokedexController(document.querySelector("#pokedex"));