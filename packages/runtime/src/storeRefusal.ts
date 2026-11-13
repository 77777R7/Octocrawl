/**
 * A store's refusal of what it was asked: no such monitor, run or destination, or a state that does not allow the
 * change (a revision out of order, a delivery not dead-lettered). The API answers it as 404 or 409. A store that fails
 * (a locked or unreadable database) throws its own error instead, which the API answers as a 500.
 */
export class StoreRefusal extends Error {
  override readonly name = 'StoreRefusal'
}
