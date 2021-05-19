//@ts-check
// Manually import the array polyfills because the API is using functions not supported in IE11.
import "core-js/es/array";

import * as d3 from "d3";
let hashcode = require("hashcode");
let seedrandom = require("seedrandom");

import { cloud } from "./d3-cloud.js";
import { measureText } from "./text-measure";
import { createTooltipGenerator } from "./generic-tooltip";
import { addHandlersSelection, removeHandlersSelection } from "./rect-selection";
import { Axis, DataView, DataViewCategoricalValue, DataViewRow, ModProperty, Size } from "../spotfire/spotfire-api-1-1";
import { BaseType, range, schemeGnBu } from "d3";
import { readerWithChangeChecker } from "./readerWithChangeChecker";

const Spotfire = window.Spotfire;

/**
 * Prepare some dom elements that will persist  throughout mod lifecycle
 */

const modContainer = d3.select("#mod-container");

// Main svg container
const svg = modContainer.append("svg").attr("xmlns", "http://www.w3.org/2000/svg");

/**
 * @type {Spotfire.OnLoadCallback}
 */
const init = async (mod: Spotfire.Mod) => {
    /**
     * Initialize render context - should show 'busy' cursor.
     * A necessary step for printing (another step is calling render complete)
     */
    const context = mod.getRenderContext();

    const styling = context.styling;
    const { tooltip, popout } = mod.controls;
    const { radioButton, checkbox } = popout.components;
    const { section } = popout;
      
    interface WordType {
        text: string, 
        size: number,
        color: string,
        tooltip: string,
        row: DataViewRow,
        id: string;
    }

    interface PlacedWordType extends WordType {
        font: string,
        x: number, 
        y: number, 
        rotate: number
    }

    let prevHash: number,
        words: WordType[],
        lastDataview;
    
    // Settings cogwheel
    const cogwheel = modContainer.append("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("id", "cogwheel")
        .style("opacity", "0");
    cogwheel.append("path")
        .attr("d", "M13.621,5.904l-1.036-0.259c-0.168-0.042-0.303-0.168-0.356-0.332c-0.091-0.284-0.205-0.559-0.339-0.82 c-0.079-0.154-0.072-0.337,0.017-0.486l0.55-0.915c0.118-0.197,0.087-0.449-0.075-0.611l-0.863-0.863 c-0.163-0.162-0.414-0.193-0.611-0.075L9.992,2.092C9.844,2.181,9.66,2.188,9.506,2.109C9.244,1.975,8.97,1.861,8.686,1.77 C8.521,1.717,8.395,1.583,8.353,1.415L8.094,0.379C8.039,0.156,7.839,0,7.609,0H6.39C6.161,0,5.961,0.156,5.905,0.379L5.647,1.415 C5.605,1.582,5.479,1.717,5.314,1.77C5.029,1.861,4.755,1.975,4.493,2.109C4.339,2.188,4.155,2.182,4.007,2.093L3.092,1.544 C2.895,1.426,2.644,1.457,2.481,1.619L1.619,2.481C1.457,2.644,1.426,2.895,1.544,3.092l0.549,0.915 c0.089,0.148,0.095,0.332,0.017,0.486C1.975,4.755,1.861,5.029,1.77,5.314c-0.053,0.165-0.188,0.29-0.355,0.332L0.379,5.905 C0.156,5.961,0.001,6.161,0.001,6.39L0,7.609c0,0.229,0.156,0.43,0.378,0.485l1.036,0.259C1.583,8.396,1.717,8.521,1.77,8.686 c0.091,0.285,0.205,0.559,0.339,0.821c0.079,0.154,0.073,0.337-0.016,0.486l-0.549,0.915c-0.118,0.196-0.087,0.448,0.075,0.61 l0.862,0.863c0.163,0.163,0.415,0.193,0.611,0.075l0.915-0.549c0.148-0.089,0.332-0.095,0.486-0.017 c0.262,0.134,0.537,0.248,0.821,0.339c0.165,0.053,0.291,0.187,0.333,0.355l0.259,1.036C5.961,13.844,6.16,14,6.39,14h1.22 c0.23,0,0.429-0.156,0.485-0.379l0.259-1.036c0.042-0.167,0.168-0.302,0.333-0.355c0.285-0.091,0.559-0.205,0.821-0.339 c0.154-0.079,0.338-0.072,0.486,0.017l0.915,0.549c0.197,0.118,0.448,0.088,0.611-0.075l0.863-0.863 c0.162-0.162,0.193-0.414,0.075-0.611l-0.549-0.915c-0.089-0.148-0.095-0.332-0.017-0.486c0.134-0.262,0.248-0.536,0.339-0.82 c0.053-0.165,0.188-0.291,0.356-0.333l1.036-0.259C13.844,8.039,14,7.839,14,7.609V6.39C14,6.16,13.844,5.96,13.621,5.904z M7,9.5 C5.619,9.5,4.5,8.381,4.5,7c0-1.381,1.119-2.5,2.5-2.5S9.5,5.619,9.5,7C9.5,8.381,8.381,9.5,7,9.5z");
    modContainer.on("mouseover", () => cogwheel.style("opacity", "1"))
        .on("mouseout", () => cogwheel.style("opacity", "0"));

    // Info icon
    const infoIcon = modContainer.append("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("id", "infoIcon")
        .style("display", "none")
        .attr("tooltipText", "Not all words are visible. Try turning off font size normalization and adjusting the font size manually.");
    infoIcon.append("path")
        .attr("d", "M6.5,12.93A6.5,6.5,0,0,0,13,6.43,6.42,6.42,0,0,0,6.5,0,6.42,6.42,0,0,0,0,6.43,6.5,6.5,0,0,0,6.5,12.93ZM6,3H7V5H6ZM6,6H7v4H6Z");
    infoIcon.on("mouseover", () => tooltip.show(infoIcon.attr("tooltipText")))
        .on("mouseout", () => tooltip.hide());

    /**
     * Create reader function which is actually a one time listener for the provided values.
     * @type {Spotfire.Reader}
     */
    const reader = readerWithChangeChecker(mod.createReader(
        mod.visualization.data(),
        mod.windowSize(),
        mod.property("rotation"),
        mod.property("normalizeFont"),
        mod.property("useImpactFont"),
        mod.property("randomPlacement"),
        mod.visualization.axis("Words"),
        mod.visualization.axis("Font size"),
        mod.visualization.axis("Color")
    ));

    /**
     * Creates a function that is part of the main read-render loop.
     * It checks for valid data and will print errors in case of bad data or bad renders.
     * It calls the listener (reader) created earlier and adds itself as a callback to complete the loop.
     * @param {Spotfire.DataView} dataView
     * @param {Spotfire.Size} windowSize
     * @param {Spotfire.ModProperty<string>} rotation - Number of word rotations requested
     * @param {Spotfire.ModProperty<boolean>} normalizeFont - Normalize font size or not
     * @param {Spotfire.ModProperty<boolean>} useImpactFont - Use Impact font or style default
     * @param {Spotfire.ModProperty<boolean>} randomPlacement - Distribute words randomly
     */
    const onChange = async (
        dataView: Spotfire.DataView,
        windowSize: Spotfire.Size,
        rotation: Spotfire.ModProperty<string>,
        normalizeFont: Spotfire.ModProperty<boolean>,
        useImpactFont: Spotfire.ModProperty<boolean>,
        randomPlacement: Spotfire.ModProperty<boolean>,
        wordsAxisMeta: Spotfire.Axis,
        fontSizeAxisMeta: Spotfire.Axis,
        colorAxisMeta: Spotfire.Axis) => {
            
        // Show progress indicator if drawing takes a while
        let drawingFinished = false;
        setTimeout(function() {
            if (!drawingFinished) mod.controls.progress.show();  
        }, 500);
        
        try {
            tooltip.hide();

            await render(
                dataView,
                windowSize,
                rotation,
                normalizeFont,
                useImpactFont,
                randomPlacement,
                wordsAxisMeta,
                fontSizeAxisMeta,
                colorAxisMeta,
                () => {            
                    // Hide progress indicator
                    drawingFinished = true;
                    mod.controls.progress.hide();                    
                    context.signalRenderComplete();
                    
                    // Everything went well this time. Clear any error.
                    mod.controls.errorOverlay.hide("catch");
                }
            );
        } catch (e) {
            mod.controls.errorOverlay.show(
                e.message || e || "☹️ Something went wrong, check developer console",
                "catch"
            );
            
            // Hide progress indicator
            drawingFinished = true;
            mod.controls.progress.hide();
            context.signalRenderComplete();
        }
    };

    /**
     * Initiates the read-render loop
     */
    reader.subscribe(onChange);  

    /**
     * Renders the chart.
     * @param {RenderOptions} options - Render Options
     * @typedef {Object} RenderOptions
     * @property {Spotfire.DataView} dataView - dataView
     * @property {Spotfire.Size} windowSize - windowSize
     * @property {Spotfire.ModProperty<string>} rotation - Number of word rotations requested
     * @property {Spotfire.ModProperty<boolean>} normalizeFont - Normalize font size or not
     * @property {Spotfire.ModProperty<boolean>} useImpactFont - Use Impact font or default
     * @property {Spotfire.ModProperty<boolean>} randomPlacement - Distribute words randomly
     * @property {any} onComplete - windowSize
     */
    async function render(
        dataView: DataView,
        windowSize: Size,
        rotation: ModProperty<string>,
        normalizeFont: ModProperty<boolean>,
        useImpactFont: ModProperty<boolean>,
        randomPlacement: ModProperty<boolean>,
        wordsAxisMeta: Axis,
        fontSizeAxisMeta: Axis,
        colorAxisMeta: Axis,
        onComplete: CallableFunction) {
        /**
         * The DataView can contain errors which will cause rowCount method to throw.
         */
        let errors = await dataView.getErrors();
        if (errors.length > 0) {
            // Data view contains errors. Display these and clear the chart to avoid
            // getting a flickering effect with an old chart configuration later (TODO).
            throw errors;
        }

        mod.controls.errorOverlay.hide("dataView");
        infoIcon.style("display", "none");

        const rows = await dataView.allRows();
        if (rows == null) {
            // Return and wait for next call to render when reading data was aborted.
            // Last rendered data view is still valid from a users perspective since
            // a document modification was made during a progress indication.
            return;
        }

        lastDataview = dataView;

        // Was a Words axis set?
        if (wordsAxisMeta.parts.length == 0) {
            // If not, remove all previously rendered bits and return
            clearPreviousRender();
            onComplete();
            return;
        }

        // Extract data from dataview
        const fontSizeSet = fontSizeAxisMeta.parts.length > 0,
            categoricalValue = (dvcv: DataViewCategoricalValue) => dvcv.formattedValue(","),
            tooltipGen = await createTooltipGenerator([wordsAxisMeta, fontSizeAxisMeta, colorAxisMeta]);

        words = rows.map((r: DataViewRow) => ({
            text: categoricalValue(r.categorical("Words")), 
            size: fontSizeSet ? r.continuous("Font size").value() as number: 20,
            color: r.color().hexCode,
            tooltip: tooltipGen(r),
            id: r.elementId(),
            row: r
        }));

        let hasher = hashcode.hashCode();

        // Was anything besides coloring changed?
        let nonColorData = {
            words: words.map(r => ({ 
                text: r.text,
                size: r.size
            }))
        };

        let somethingChanged = reader.hasValueChanged(
            windowSize,
            rotation,
            normalizeFont,
            useImpactFont,
            randomPlacement,
            colorAxisMeta,
            wordsAxisMeta
            );
        let hash = hasher.value(nonColorData);        
        if (!somethingChanged && prevHash == hash) {
            // Only the colors changed, don't do a full re-render, just update the colors
            svg.selectAll<any, WordType>("text:not(.hover)")
                // @ts-ignore
                .data(words, w => w.id)
                .style("fill", (w) => w.color);

            onComplete();
        } else {
            // More than the colors changed, rerender cloud fully

            // Sets the viewBox to match windowSize
            svg.attr("viewBox", [0, 0, windowSize.width, windowSize.height].toString());
            clearPreviousRender();

            // Due to the irregular shapes of text and the imprecision of the default
            // browser hittesting for text (try e.g. a ☺ smiley) we use a custom hitmap
            // for handling mouse operations
            let hitmap:  PlacedWordType[],
                winWidth32 = (windowSize.width + 0x1f) >> 5 << 5,
                hitPlacedWord = (x: number, y: number) => hitmap?.[Math.floor(x) + Math.floor(y) * winWidth32], // Rounding for IE11
                hitWord = (x: number, y: number) => { 
                    let placedWord = hitPlacedWord(x, y); 
                    return placedWord !== undefined ? words.find(w => w.id == placedWord.id) as PlacedWordType : undefined;
                };

            // Handle mouse operations
            let hoverMarking;
            svg.on("click", () => { 
                    let w = hitWord(d3.event.pageX, d3.event.pageY);
                    if (w) {
                        w.row.mark(d3.event.ctrlKey ? "Toggle" : "Replace"); 
                    } else {
                        if (!d3.event.ctrlKey) lastDataview.clearMarking();
                    }
                }).on("mousemove", function() {
                    let w = hitWord(d3.event.pageX, d3.event.pageY);
                    //let elem = document.elementFromPoint(d3.event.pageX, d3.event.pageY);
                    if (w) {
                        let elem = svg.selectAll("g").selectAll<any, WordType>("text").filter(t => t.id === w.id);
                        // Add hover effect to word
                        if (!hoverMarking || hoverMarking.original !== elem.node()) {
                            clearHoverMarking(hoverMarking);
                            hoverMarking = showHoverMarking(hoverMarking, elem);
                        }
                        tooltip.show(w.tooltip);
                    } else {
                        // Remove hover effect from word
                        hoverMarking = clearHoverMarking(hoverMarking);
                        tooltip.hide();
                    }
                })
                .on("mouseout", function(tag) {
                    hoverMarking = clearHoverMarking(hoverMarking);
                    tooltip.hide();
                });

            // Handle rectangle markings
            addHandlersSelection((result) => {
                if ("x" in result) {
                    let bounds = svg.node().getBoundingClientRect();
                    result.x -= bounds.x || bounds.left; // Left and top for IE11
                    result.y -= bounds.y || bounds.top;
                    result.x = Math.floor(result.x); // Rounding for IE11
                    result.y = Math.floor(result.y);
                    result.width = Math.floor(result.width);
                    result.height = Math.floor(result.height);

                    let ids: string[] = [];
                    for (let y = result.y; y < result.y + result.height; ++y)  {
                        for (let x = result.x; x < result.x + result.width; ++x)  {
                            let placedWord = hitPlacedWord(x, y);
                            if (placedWord !== undefined && !ids.includes(placedWord.id)) ids.push(placedWord.id);
                        }
                    }   
                    // @ts-ignore
                    let markedWords = words.filter(w => ids.includes(w.id));
                    markedWords.forEach(w => w.row.mark(result.ctrlKey ? "Toggle" : "Replace"));
                }
            });

            // Determine on font to use
            const font = useImpactFont.value() ? "Impact,sans-serif" : styling.general.font.fontFamily;

            // Create normalization function for font sizes
            const padding = windowSize.width > 400 && windowSize.height > 400 ? 2 : windowSize.width > 200 && windowSize.height > 200 ? 1 : 0;
            let normalizer = createFontSizeNormalizer(font, padding);

            // Seed the randomizer to make sure the words appear in the same place on each render
            const randomizer = seedrandom('Boe ne kikker!');
            
            // Rotate words based on property
            const rotators = {
                none: () => 0,
                two: () => (~~(randomizer() * 2) * 90 - 90),
                five: () => (~~(randomizer() * 5) * 30 - 60),
            }

            // Start calculating word positions
            cloud().size([windowSize.width, windowSize.height])
                // @ts-ignore
                .words(words)
                .random(randomPlacement.value() ? randomizer : () => .5) 
                .padding(padding)
                .rotate(rotators[rotation.value()]) 
                .font(font)
                .fontSize((d) => normalizer(d.size))
                .on("end", end)
                .timeInterval(500)
                .start();

            // Render calculated cloud of words
            function end(tagHitmap: PlacedWordType[], tags: PlacedWordType[]) { 
                hitmap = tagHitmap;

                // Show words
                svg.append("g")
                    .attr("transform", `translate(${windowSize.width / 2},${windowSize.height / 2})`)
                    .selectAll("text")
                    .data(tags)
                    .enter().append("text")
                        .style("font-size", ({ size }) => `${size}px`)
                        .style("font-family", ({ font }) => font)
                        .style("fill", ({ color }) => color)
                        .attr("text-anchor", "middle")
                        .attr("transform", ({ x, y, rotate }) => `translate(${x}, ${y})rotate(${rotate})`)
                        .text(({ text }) => text);
                
                // Were all words rendered?
                if (words.length != tags.length) {
                    // No, show info icon
                    let text = `Only ${tags.length} of ${words.length} words visible. `;
                    text += normalizeFont.value() ? "Try turning off font size normalization and adjusting the font size manually." : "Try diminishing the font size.";
                    infoIcon.attr("tooltipText", text);
                    infoIcon.style("display", "inline");
                }

                onComplete();
            }             
    
            // Create settings popout 
            createSettingsPopout();
        }
        prevHash = hash;

        function clearPreviousRender() {
            prevHash = undefined;
            svg.selectAll("*").remove();
            removeHandlersSelection();
            svg.on("click", null);
            svg.on("mousemove", null);
            svg.on("mouseout", null);
        }

        function showHoverMarking(hoverMarking: any, elem: d3.Selection<d3.BaseType, WordType, d3.BaseType, unknown>) {
            hoverMarking = {
                original: elem.node() as SVGTextElement,
                clones: [
                    elem.clone(true).attr("class", "hover").style("stroke", "white").style("stroke-width", 8).lower(),
                    elem.clone(true).attr("class", "hover").style("stroke", "black").style("stroke-width", 9).lower(),
                    elem.clone(true).attr("class", "hover").style("stroke", "white").style("stroke-width", 10).lower()
                ]
            };
            return hoverMarking;
        }

        function clearHoverMarking(hoverMarking: { original: Element; clones: d3.Selection<BaseType, unknown, BaseType, undefined>[]; }) {
            if (hoverMarking) {
                hoverMarking.clones.forEach(s => s.remove());
                hoverMarking = undefined;
            }
            return hoverMarking;
        }

        function createSettingsPopout() {
            const settingsPopout = () => [
                section({
                    heading: "Rotation",
                    children: [
                        radioButton({
                            name: rotation.name,
                            text: "Horizontal",
                            value: "none",
                            checked: rotation.value() == "none"
                        }),
                        radioButton({
                            name: rotation.name,
                            text: "Horizontal and vertical",
                            value: "two",
                            checked: rotation.value() == "two"
                        }),
                        radioButton({
                            name: rotation.name,
                            text: "Different angles",
                            value: "five",
                            checked: rotation.value() == "five"
                        })
                    ]
                }),
                section({
                    heading: "Distribution",
                    children: [
                        radioButton({
                            name: "randomPlacement",
                            text: "Centralise",
                            value: false,
                            tooltip: "Biggest sizes placed at the center",
                            checked: randomPlacement.value() == false
                        }),
                        radioButton({
                            name: "randomPlacement",
                            text: "Disperse",
                            value: true,
                            tooltip: "Words placed indifferent of sizes",
                            checked: randomPlacement.value() == true
                        })
                    ]
                }),
                section({
                    heading: "Font",
                    children: [
                        checkbox({
                            name: "normalizeFont",
                            text: "Normalize font size",
                            enabled: true,
                            tooltip: "If unchecked font size will be set absolutely",
                            checked: normalizeFont.value() == true
                        }),
                        checkbox({
                            name: "useImpactFont",
                            text: "Use 'Impact' font",
                            enabled: true,
                            tooltip: "Use 'Impact' font rather than default from analysis",
                            checked: useImpactFont.value() == true
                        }),
                    ]
                })
            ];

            cogwheel.node().onclick = (e) => {
                tooltip.hide();
                popout.show(
                    {
                        x: e.x,
                        y: e.y,
                        autoClose: true,
                        alignment: "Top",
                        onChange: (event) => {
                            const { name, value } = event;
                            name == rotation.name && rotation.set(value);
                            name == randomPlacement.name && randomPlacement.set(value);
                            name == normalizeFont.name && normalizeFont.set(value);
                            name == useImpactFont.name && useImpactFont.set(value);
                        }
                    },
                    settingsPopout
                );
            };
        }

        function createFontSizeNormalizer(font: string, padding: number) {
            let normalizer: (size: number) => number;
            if (!normalizeFont.value()) {
                // The user requested absolute font sizes
                normalizer = (size) => size;
            } else {
                // Estimate the maximum fontsize that we'll show in the word cloud
                let roundHeight = (h: number) => h + 2 * padding;
                let roundWidth = (w: number) => (w + 2 * padding + 0x1f) >> 5 << 5; // d3-cloud uses monochrome bitmaps mapped to 32-bit integers for hit testing, thus the odd rounding
                
                // First calculate the dimensions of the words as if we were to decide on max fontsize 1000
                const 
                    sizes = words.map(w => w.size as number),
                    minSize = d3.min(sizes),
                    maxSize = d3.max(sizes),
                    initialFontSize = 1000,
                    tempNormalizer = d3.scaleLinear().domain([Math.min(minSize, 0), maxSize]).range([0, initialFontSize]),
                    metrics = words.map(({ text, size }) => measureText(text, tempNormalizer(size), font)),
                    initialHeights = metrics.map((met, i) => met.actualBoundingBoxAscent === undefined ? tempNormalizer(words[i].size) : met.actualBoundingBoxAscent + met.actualBoundingBoxDescent),
                    initialWidths = metrics.map(met => met.actualBoundingBoxLeft === undefined ? met.width : met.actualBoundingBoxLeft + met.actualBoundingBoxRight);
                
                // Next calculate the size of the available window area
                const
                    winHeight = windowSize.height,
                    winWidth = windowSize.width >> 5 << 5, // d3-cloud uses monochrome bitmaps mapped to 32-bit integers for hit testing, thus the odd rounding
                    winSurface = winWidth * winHeight;                
                        
                // Iterate to decide on max fonsize, not by plotting the word cloud as that would be to expensive
                // but by estimating the used surface area. Iterating is preferable as the padding offset is fixed 
                // irrespective of font size and thus has a greater or smaller impact depending on the initial 
                // font size estimate.
                let widths: number[], heights: number[],
                    prevSize = 0, size = initialFontSize, 
                    prevSurface = Number.MAX_SAFE_INTEGER, surface = Number.MAX_SAFE_INTEGER - 1;
                while (Math.abs(size - prevSize) >= 1.0 && Math.abs(winSurface - surface) < Math.abs(winSurface - prevSurface)) { 
                    const ratio = size / initialFontSize;
                    heights = initialHeights.map(h => roundHeight(ratio * h));
                    widths = initialWidths.map(w => roundWidth(ratio * w)); 
                    
                    prevSurface = surface;
                    surface = widths.reduce((r, v, i) => r + v * heights[i], 0);
                    prevSize = size;
                    size = prevSize * Math.sqrt(winSurface / surface); 
                }

                // Secondly validate that the heighest and widest word also fit within the window size
                const   
                    maxHeightIndex = initialHeights.reduce((r, v, i) => (v > initialHeights[r]) ? i : r, 0),
                    maxWidthIndex = initialWidths.reduce((r, v, i) => (v > initialWidths[r]) ? i : r, 0);
                let highestSize = initialFontSize * winHeight / roundHeight(initialHeights[maxHeightIndex]),
                    widestSize = initialFontSize * winWidth / roundWidth(initialWidths[maxWidthIndex]);
                // Iterate also here to smooth out rounding imperfections
                while (roundHeight(highestSize * initialHeights[maxHeightIndex] / initialFontSize) >= winHeight)
                    --highestSize;
                while (roundWidth(widestSize * initialWidths[maxWidthIndex] / initialFontSize) >= winWidth)
                    --widestSize;

                // Choose the smallest maximum font depending on surface area, highest or widest word
                const result = Math.min(prevSize * .85, highestSize, widestSize); // .85 To aim for 15% of empty surface area around the word cloud

                // Finish of by returning a function that maps the fontsize within a range of minFontSize to the maximum font size
                normalizer = d3.scaleLinear().domain([Math.min(minSize, 0), maxSize] as d3.NumberValue[]).range([0, result]);
            }
            return normalizer;
        }
    }
};

/**
 * Trigger init
 */
Spotfire.initialize(init);
