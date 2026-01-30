import UploadExcel from './components/UploadExcel';
import UploadHistory from './components/UploadHistory';
import SearchItems from './components/SearchItems';

function App() {
  return (
    <>
      <UploadExcel />
      <hr />
      <UploadHistory />
      <hr />
      <SearchItems />
    </>
  );
}

export default App;