//import * as Module from "../node_modules/webpack/lib/Module";
import { DataViewCategoricalValue, DataViewContinuousValue } from "../spotfire/spotfire-api";

type TooltipGenerator = (row: Spotfire.DataViewRow) => string;

/**
 * Returns a function that will generate a clean generic tooltip for a given row
 * @param {[Spotfire.Axis]} axes Axes to generate tooltips for
 * @returns {string} Tooltip text
 **/
export async function createTooltipGenerator(axes: Spotfire.Axis[]): Promise<TooltipGenerator> {
    const 
        catValue = (v: DataViewCategoricalValue, i: number) => v.value()[i].formattedValue(),
        conValue = (v: DataViewContinuousValue) => v.formattedValue();

    return (row: Spotfire.DataViewRow) => 
        axes.flatMap(axis => axis.parts.map((part, index) =>             
            part.displayName + ": " + function() {
                // @ts-ignore
                if (axis.isCategorical || axis.mode == "categorical") {
                    return catValue(row.categorical(axis.name), index);
                } else {
                    return conValue(row.continuous(axis.name));
                }
            }()
        )).reduce((r, v) => r + "\n" + v);
}