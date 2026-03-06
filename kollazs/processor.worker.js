// processor.worker.js
self.onmessage = function(e) {
    const { imageData } = e.data;
    const data = imageData.data;

    // Pixel-szintű manipuláció (fehér háttér vágása)
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 250 && g > 250 && b > 250) {
            data[i + 3] = 0; // Alfa csatorna nullázása
        }
    }

    self.postMessage({ imageData }, [imageData.data.buffer]);
};