export function useRouter() {
  return {
    push: (url: string) => {
      window.location.hash = url;
    },
    replace: (url: string) => {
      window.location.hash = url;
    },
    back: () => {
      window.history.back();
    },
  };
}

export function notFound() {
  return null;
}
