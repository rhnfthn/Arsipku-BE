export interface EditorConfig {
  documentType: 'word' | 'cell' | 'slide' | 'pdf';
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: {
      edit: boolean;
      download: boolean;
      review: boolean;
      print: boolean;
    };
  };
  editorConfig: {
    mode: 'edit' | 'view';
    callbackUrl: string;
    user: { id: string; name: string };
    customization?: {
      forcesave: boolean;
      compactHeader: boolean;
    };
  };
  token: string;
}
