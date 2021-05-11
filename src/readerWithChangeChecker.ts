/**
* Wrap a reader and adds an additional method called `hasChanged`.
* It allows you to check whether a passed argument is new or unchanged since the last time the subscribe loop was called.
* @function
* @template A
* @param {A} reader
* @returns {A & {hasValueChanged(value: any):boolean}}
*/
export function readerWithChangeChecker(reader) {
    let previousValues = [];
    let currentValues = [];

    function storeValuesForComparison(cb) {
        return function storeValuesForComparison(...values) {
            previousValues = currentValues;
            currentValues = values;
            return cb(...values);
        };
    }

    return {
        ...reader,
        subscribe(cb) {
            reader.subscribe(storeValuesForComparison(cb));
        },
        hasValueChanged(...values) {
            return !!values.find(value => previousValues.indexOf(value) == -1);
        }
    };
}