export default class HTTP {
  BASE: string | null = null

  constructor(url?: string) {
    if (url) this.BASE = url
  }

  private get enabled(): boolean {
    return this.BASE !== null && this.BASE !== ''
  }

  async ids(): Promise<string[]> {
    throw new Error('unimplemented')
  }

  async getItem(id: string, actorId?: string): Promise<ArrayBuffer | null> {
    if (!this.enabled) return null
    let url = this.getURI(id)
    return new Promise<ArrayBuffer | null>((resolve, reject) => {
      fetch(url)
        .then((response) => {
          if (response.status === 200) return resolve(response.arrayBuffer())
          else return resolve(null)
        })
        .catch((err) => {
          console.error(err)
          resolve(null)
        })
    })
  }

  async setItem(
    id: string,
    binary: Uint8Array,
    filename?: string
  ): Promise<Response | null> {
    if (!this.enabled) return null
    let form = new FormData()
    form.append(id, new Blob([binary]))
    return fetch(this.getURI(id) + '?filename=' + filename, {
      body: form,
      method: 'post',
    })
  }

  async deleteItem(id: string): Promise<Response | null> {
    if (!this.enabled) return null
    let binary = ''
    return fetch(this.getURI(id), {
      body: binary,
      method: 'post',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })
  }
  getURI(id: string): string {
    return `${this.BASE}/${id}`
  }
}
