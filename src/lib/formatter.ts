export const formatName = (name: string) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Basic capitalization but keeping particles like 'de', 'la', 'del' lowercased if not the first word
      const particles = ['de', 'la', 'del', 'y', 'los', 'las'];
      if (particles.includes(word) && name.toLowerCase().indexOf(word) > 0) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
};
