export function createHelpBackground(ctx, width, height) {
  const brightColors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57",
    "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3", "#FF9F43",
    "#C44569", "#786FA6", "#FDCB6E", "#E17055", "#74B9FF"
  ];

  const numStops = 2 + Math.floor(Math.random() * 2);
  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);

  for (let i = 0; i < numStops; i++) {
    const color = brightColors[Math.floor(Math.random() * brightColors.length)];
    const position = i / (numStops - 1);
    backgroundGradient.addColorStop(position, color);
  }

  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 40; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 3 + 1;
    const opacity = Math.random() * 0.15 + 0.05;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fill();
  }
}
