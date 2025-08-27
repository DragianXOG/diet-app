export default {
  content: ["./index.html","./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#000000',
        muted: '#f3f4f6',
        'muted-foreground': '#6b7280',
        primary: '#4B0082',  // indigo
        accent:  '#4CBB17',  // green
      },
      boxShadow: {
        soft: '0 6px 16px rgba(0,0,0,0.06)',
      }
    }
  },
  plugins: [],
}
