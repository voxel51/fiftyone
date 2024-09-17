import Box from '@mui/material/Box';
import SearchBar from './SearchBar';
import SortControll from './SortControll';

export default function ControllBar() {
  return (
    <Box display="flex" justifyContent="space-between" pb={2}>
      <SearchBar />
      <SortControll />
    </Box>
  );
}
