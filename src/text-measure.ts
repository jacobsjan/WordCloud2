var canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');

/**
 * Measures the rendered dimensions of arbitrary text given the font size and font face
 * @param {string} text The text to measure
 * @param {number} fontSize The font size in pixels
 * @param {string} fontFace The font face ("Arial", "Helvetica", etc.)
 * @returns {TextMetrics} The width of the text
 **/
export function measureText(text: string, fontSize: any, fontFace: string): TextMetrics {
    context.font = fontSize + 'px ' + fontFace;
    return context.measureText(text);
}